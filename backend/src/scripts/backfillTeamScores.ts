/**
 * Backfills `news_item_team_scores` for every team that has a brand voice.
 *
 * Required once after deploying per-team relevance: existing items were scored only against the
 * platform-wide pool, so until this runs every team falls back to that baseline — correct-ish for a
 * single-team deployment, wrong for more. Idempotent (upserts by item+team), so it is safe to re-run,
 * and safe to run against production while the app is serving.
 *
 *   npm run backfill:team-scores
 */
import mongoose from 'mongoose';
import config from '../app/config';
import { logger } from '../app/lib/logger';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import {
  ScorableItem,
  teamsWithBrandVoice,
  upsertTeamScores,
} from '../app/modules/NewsItemTeamScore/newsItemTeamScore.service';

// Items carry a 1536-float embedding each, so they are loaded in slices rather than all at once —
// a full active window is easily large enough to matter.
const BATCH_SIZE = 500;

const main = async () => {
  await mongoose.connect(config.database_url as string);

  const teamIds = await teamsWithBrandVoice();
  if (teamIds.length === 0) {
    logger.warn('[backfill:team-scores] No team has brand-voice examples yet — nothing to score.');
    await mongoose.connection.close();
    return;
  }

  const total = await NewsItem.countDocuments({ lifecycle: { $ne: 'archived' } });
  logger.info(`[backfill:team-scores] ${total} active items x ${teamIds.length} teams`);

  let processed = 0;
  let rows = 0;

  for (let skip = 0; skip < total; skip += BATCH_SIZE) {
    const items = await NewsItem.find(
      { lifecycle: { $ne: 'archived' } },
      { embedding: 1, trend_score: 1, relevance_score: 1, audience_fit: 1 },
    )
      // Sorted so paging with skip/limit is stable across the run; without it a concurrent insert
      // could shift the window and make a batch get skipped entirely.
      .sort({ _id: 1 })
      .skip(skip)
      .limit(BATCH_SIZE)
      .lean<ScorableItem[]>();

    if (items.length === 0) break;

    for (const teamId of teamIds) {
      rows += await upsertTeamScores(teamId, items);
    }

    processed += items.length;
    logger.info(`[backfill:team-scores] ${processed}/${total} items — ${rows} score rows written`);
  }

  logger.info(`[backfill:team-scores] Done. ${rows} rows across ${teamIds.length} teams.`);
  await mongoose.connection.close();
};

main().catch(async (err) => {
  logger.fatal({ err: err instanceof Error ? err.message : err }, '[backfill:team-scores] failed');
  await mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});
