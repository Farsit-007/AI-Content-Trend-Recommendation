import { logger } from '../../lib/logger';
import { embed } from '../../lib/embeddings';
import { getPlatformToken } from '../../lib/platformCredentials';
import { redis } from '../../lib/redis';
import { Team } from '../Team/team.model';
import { TeamPlatform } from '../PlatformCatalog/platformCatalog.model';
import { PlatformPost } from '../PlatformPost/platformPost.model';
import { getAdapter } from './adapters';
import { AnalyticsRollup } from './analytics.model';
import { computeRollup } from './analytics.rollup';
import { IAdapterPost, IAnalyticsRefreshSummary, IAnalyticsRollup } from './analytics.interface';

const embedNewPosts = async (
  teamId: string,
  platform: string,
  posts: IAdapterPost[],
): Promise<void> => {
  const existingIds = new Set(
    (await PlatformPost.find({ team_id: teamId, platform }).select('post_id')).map((p) => p.post_id),
  );

  const newPosts = posts.filter((p) => !existingIds.has(p.post_id));
  if (newPosts.length === 0) return;

  for (const post of newPosts) {
    try {
      const text = post.content_snippet ?? post.post_id;
      const embedding = await embed(text);

      await PlatformPost.findOneAndUpdate(
        { team_id: teamId, platform, post_id: post.post_id },
        {
          team_id: teamId,
          platform,
          post_id: post.post_id,
          content_snippet: post.content_snippet,
          embedding,
          metrics: post.metrics,
          published_at: post.published_at,
          fetched_at: new Date(),
        },
        { upsert: true, new: true },
      );

      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, `[Analytics] Failed to embed post ${post.post_id}`);
    }
  }
};

const upsertRollup = async (data: Omit<IAnalyticsRollup, '_id'>): Promise<void> => {
  await AnalyticsRollup.findOneAndUpdate(
    { team_id: data.team_id, platform: data.platform },
    { ...data, fetched_at: new Date() },
    { upsert: true, new: true },
  );
};

export const runAnalyticsRefresh = async (
  filter?: { teamId?: string },
): Promise<IAnalyticsRefreshSummary> => {
  const teamQuery = filter?.teamId ? { _id: filter.teamId } : {};
  const teams = await Team.find(teamQuery).lean();

  let teamsProcessed = 0;
  let platformsProcessed = 0;

  for (const team of teams) {
    const teamId = team._id.toString();

    const enabledPlatforms = await TeamPlatform.find({ team_id: teamId, is_enabled: true }).lean();
    if (enabledPlatforms.length === 0) continue;

    teamsProcessed++;

    for (const tp of enabledPlatforms) {
      const platform = tp.platform;

      try {
        const token = await getPlatformToken(platform, teamId);

        if (token === null) {
          await upsertRollup({
            team_id: teamId,
            platform,
            status: 'not_connected',
            period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
            overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
            top_posts: [],
            best_times: [],
            content_breakdown: [],
            fetched_at: new Date(),
          });
          platformsProcessed++;
          continue;
        }

        const adapter = getAdapter(platform);
        const result = await adapter(token, teamId, platform);

        if (result.status === 'pending_approval') {
          await upsertRollup({
            team_id: teamId,
            platform,
            status: 'pending_approval',
            period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
            overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
            top_posts: [],
            best_times: [],
            content_breakdown: [],
            fetched_at: new Date(),
          });
          platformsProcessed++;
          continue;
        }

        await embedNewPosts(teamId, platform, result.posts);

        const rollupData = computeRollup(teamId, platform, result.posts);
        await upsertRollup({
          team_id: teamId,
          platform,
          status: 'ok',
          ...rollupData,
          fetched_at: new Date(),
        });

        platformsProcessed++;
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : err },
          `[Analytics] Failed for team ${teamId} platform ${platform}`,
        );
        await upsertRollup({
          team_id: teamId,
          platform,
          status: 'error',
          period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
          overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
          top_posts: [],
          best_times: [],
          content_breakdown: [],
          fetched_at: new Date(),
        });
        platformsProcessed++;
      }
    }

    await redis.del(`report:${teamId}`);
  }

  return { success: true, teamsProcessed, platformsProcessed };
};

export const getTeamAnalytics = async (teamId: string): Promise<IAnalyticsRollup[]> => {
  return AnalyticsRollup.find({ team_id: teamId }).lean();
};
