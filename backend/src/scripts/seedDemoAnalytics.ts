/**
 * Seeds realistic platform_posts and platform_analytics rollups for all teams.
 * Idempotent: re-running skips posts that already exist and only embeds new ones.
 *
 * Run: npm run seed:demo-analytics
 */
import mongoose from 'mongoose';
import config from '../app/config';
import { embed } from '../app/lib/embeddings';
import { AnalyticsRollup } from '../app/modules/Analytics/analytics.model';
import { computeRollup } from '../app/modules/Analytics/analytics.rollup';
import { mockAdapter } from '../app/modules/Analytics/adapters/mock';
import { PlatformPost } from '../app/modules/PlatformPost/platformPost.model';
import { TeamPlatform } from '../app/modules/PlatformCatalog/platformCatalog.model';
import { Team } from '../app/modules/Team/team.model';

const DEMO_PLATFORMS = ['facebook', 'youtube', 'linkedin'];

async function seedDemoAnalytics() {
  await mongoose.connect(config.database_url as string);
  console.log('[seed:demo-analytics] Connected to MongoDB');

  const teams = await Team.find().lean();
  if (teams.length === 0) {
    console.log('[seed:demo-analytics] No teams found — run seed:admin first');
    await mongoose.disconnect();
    return;
  }

  for (const team of teams) {
    const teamId = team._id.toString();
    console.log(`[seed:demo-analytics] Seeding team: ${team.name} (${teamId})`);

    const enabledRows = await TeamPlatform.find({ team_id: teamId, is_enabled: true }).lean();
    const platforms = enabledRows.length > 0
      ? enabledRows.map((r) => r.platform)
      : DEMO_PLATFORMS;

    for (const platform of platforms) {
      if (platform === 'linkedin') {
        await AnalyticsRollup.findOneAndUpdate(
          { team_id: teamId, platform },
          {
            team_id: teamId,
            platform,
            status: 'pending_approval',
            period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
            overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
            top_posts: [],
            best_times: [],
            content_breakdown: [],
            fetched_at: new Date(),
          },
          { upsert: true },
        );
        console.log(`  [${platform}] Written pending_approval rollup`);
        continue;
      }

      const { posts } = await mockAdapter(teamId, platform);
      const existingIds = new Set(
        (await PlatformPost.find({ team_id: teamId, platform }).select('post_id').lean()).map((p) => p.post_id),
      );

      let newCount = 0;
      for (const post of posts) {
        if (existingIds.has(post.post_id)) continue;

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
            { upsert: true },
          );
          newCount++;
          await new Promise((r) => setTimeout(r, 120));
        } catch (err) {
          console.error(`  [${platform}] embed failed for ${post.post_id}:`, err instanceof Error ? err.message : err);
        }
      }

      const rollupData = computeRollup(teamId, platform, posts);
      await AnalyticsRollup.findOneAndUpdate(
        { team_id: teamId, platform },
        { team_id: teamId, platform, status: 'ok', ...rollupData, fetched_at: new Date() },
        { upsert: true },
      );

      console.log(`  [${platform}] ${newCount} new posts embedded, rollup upserted`);
    }
  }

  await mongoose.disconnect();
  console.log('[seed:demo-analytics] Done');
}

seedDemoAnalytics().catch((err) => {
  console.error('[seed:demo-analytics] Fatal error:', err);
  process.exit(1);
});
