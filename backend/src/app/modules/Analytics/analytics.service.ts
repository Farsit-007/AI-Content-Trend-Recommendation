import { logger } from '../../lib/logger';
import { embed } from '../../lib/embeddings';
import { getPlatformToken } from '../../lib/platformCredentials';
import { redis } from '../../lib/redis';
import { GraphApiError } from '../MetaOAuth/metaOAuth.graph';
import { PlatformCredential } from '../PlatformCredential/platformCredential.model';
import { Team } from '../Team/team.model';
import { TeamPlatform } from '../PlatformCatalog/platformCatalog.model';
import { PlatformPost } from '../PlatformPost/platformPost.model';
import { getAdapter, isMockAdapter } from './adapters';
import { AnalyticsRollup } from './analytics.model';
import { computeRollup } from './analytics.rollup';
import { IAdapterPost, IAdapterResult, IAnalyticsRefreshSummary, IAnalyticsRollup } from './analytics.interface';

const EMPTY_OVERVIEW = { reach: 0, engagements: 0, views: 0, engagement_rate: 0 };
const thirtyDayPeriod = () => ({ start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() });

/** Signals the whole refresh run must stop (app-level rate limit) rather than skip one platform. */
class RefreshAbortError extends Error {}

/** Runs the adapter, retrying ONCE after 5s for transient Meta errors (codes 1, 2). */
const runAdapterWithRetry = (
  adapter: ReturnType<typeof getAdapter>,
  token: string,
  teamId: string,
  platform: string,
  accountId?: string,
): Promise<IAdapterResult> =>
  adapter(token, teamId, platform, accountId).catch(async (err) => {
    if (err instanceof GraphApiError && (err.code === 1 || err.code === 2)) {
      await new Promise((r) => setTimeout(r, 5000));
      return adapter(token, teamId, platform, accountId);
    }
    throw err;
  });

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

  try {
   for (const team of teams) {
    const teamId = team._id.toString();

    const enabledPlatforms = await TeamPlatform.find({ team_id: teamId, is_enabled: true }).lean();
    if (enabledPlatforms.length === 0) continue;

    teamsProcessed++;

    for (const tp of enabledPlatforms) {
      const platform = tp.platform;

      const writeStub = (status: IAnalyticsRollup['status']) =>
        upsertRollup({
          team_id: teamId,
          platform,
          status,
          period: thirtyDayPeriod(),
          overview: { ...EMPTY_OVERVIEW },
          top_posts: [],
          best_times: [],
          content_breakdown: [],
          is_mock: false,
          fetched_at: new Date(),
        });

      try {
        const token = await getPlatformToken(platform, teamId);

        if (token === null) {
          await writeStub('not_connected');
          platformsProcessed++;
          continue;
        }

        const credential = await PlatformCredential.findOne({ team_id: teamId, platform }).lean();
        const adapter = getAdapter(platform);
        const result = await runAdapterWithRetry(adapter, token, teamId, platform, credential?.account_id);

        if (result.status === 'pending_approval') {
          await writeStub('pending_approval');
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
          is_mock: isMockAdapter(),
          fetched_at: new Date(),
        });

        platformsProcessed++;
      } catch (err) {
        // Map Meta's Graph error taxonomy to a rollup outcome. Non-Graph errors fall through to 'error'.
        if (err instanceof GraphApiError) {
          // Token expired/revoked/invalid — mark not_connected and flag the credential for the UI. No retry.
          if (err.code === 190) {
            await PlatformCredential.updateOne({ team_id: teamId, platform }, { token_expires_at: new Date() });
            await writeStub('not_connected');
            platformsProcessed++;
            logger.warn(`[Analytics] Token dead (190) for team ${teamId} platform ${platform} — marked not_connected`);
            continue;
          }
          // Permission missing/revoked.
          if (err.code === 10 || (err.code >= 200 && err.code <= 299)) {
            await writeStub('not_connected');
            platformsProcessed++;
            logger.warn(`[Analytics] Permission error (${err.code}) for team ${teamId} platform ${platform}`);
            continue;
          }
          // App-level rate limit — abort the ENTIRE run and let the next cron retry.
          if (err.code === 4) {
            logger.error(`[Analytics] App-level rate limit (4) — aborting refresh run`);
            throw new RefreshAbortError();
          }
          // User/Page-level rate limit — skip just this team+platform this run.
          if (err.code === 17 || err.code === 32) {
            await writeStub('error');
            platformsProcessed++;
            logger.warn(`[Analytics] Rate limit (${err.code}) — skipping team ${teamId} platform ${platform}`);
            continue;
          }
        }

        logger.error(
          { err: err instanceof Error ? err.message : err },
          `[Analytics] Failed for team ${teamId} platform ${platform}`,
        );
        await writeStub('error');
        platformsProcessed++;
      }
    }

    await redis.del(`report:${teamId}`);
   }
  } catch (err) {
    // App-level rate limit aborts the whole run; the next cron picks up where we stopped.
    if (!(err instanceof RefreshAbortError)) throw err;
  }

  return { success: true, teamsProcessed, platformsProcessed };
};

export const getTeamAnalytics = async (teamId: string): Promise<IAnalyticsRollup[]> => {
  return AnalyticsRollup.find({ team_id: teamId }).lean();
};
