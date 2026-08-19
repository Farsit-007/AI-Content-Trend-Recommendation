import { FilterQuery, Types } from 'mongoose';
import config from '../../config';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { IRetentionCounts } from '../MaintenanceRun/maintenanceRun.interface';
import { MaintenanceRun } from '../MaintenanceRun/maintenanceRun.model';
import { recordTombstones } from '../NewsDedupLedger/newsDedupLedger.service';
import { INewsItem } from '../NewsItem/newsItem.interface';
import { NewsItem } from '../NewsItem/newsItem.model';
import { NewsItemCategoryOverride } from '../NewsItemCategoryOverride/newsItemCategoryOverride.model';
import { NewsItemTeamScoreService } from '../NewsItemTeamScore/newsItemTeamScore.service';
import { REFRESHABLE_SOURCES } from '../NewsRefresh/newsRefresh.fetchers';

const LOCK_KEY = 'lock:news_retention';
// ~0.92 of the 6h default cron period, matching the engagement-refresh job's PX/cron ratio.
const LOCK_TTL_MS = 5.5 * 60 * 60 * 1000;
const ARCHIVE_BATCH_CAP = 2000;
const DELETE_BATCH_SIZE = 500;
const RECENT_OVERRIDE_PROTECTION_DAYS = 30;
const FRESH_NEEDS_REVIEW_PROTECTION_DAYS = 7;

type ArchiveReason = 'max_age' | 'trend_floor' | 'source_removed';

interface ArchiveCandidate {
  _id: unknown;
  created_at: Date;
  source_removed: boolean;
}

interface DeleteCandidate {
  _id: unknown;
  content_hash: string;
  title: string;
  source: string;
}

type BulkOps = { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[];

/** Mirrors `hasEngagementSignal` (newsIngestion.scoring.ts) exactly — exported so a unit test can
 * assert the two never drift (design.md decision 3). */
export const engagementSignalClause = {
  $or: [
    { source: { $in: REFRESHABLE_SOURCES } },
    { 'engagement.points': { $gt: 0 } },
    { 'engagement.comments': { $gt: 0 } },
    { 'engagement.stars_delta': { $gt: 0 } },
  ],
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

/** Persists one `maintenance_runs` document per run, success or failure alike (mirrors
 * `NewsRefresh/newsRefresh.service.ts`'s `persistMaintenanceRun`). Never throws. */
const persistMaintenanceRun = async (state: { started_at: Date; counts: IRetentionCounts; error?: string }): Promise<void> => {
  try {
    const finished_at = new Date();
    await MaintenanceRun.create({
      job: 'retention',
      started_at: state.started_at,
      finished_at,
      duration_ms: finished_at.getTime() - state.started_at.getTime(),
      counts: state.counts,
      error: state.error,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[NewsRetention] failed to persist MaintenanceRun');
  }
};

export const runNewsRetention = async (): Promise<void> => {
  const started_at = new Date();

  const acquired = await redis.set(LOCK_KEY, String(started_at.getTime()), 'PX', LOCK_TTL_MS, 'NX');
  if (!acquired) {
    logger.info('[NewsRetention] Another retention run holds the lock — skipping');
    return;
  }

  const counts: IRetentionCounts = {
    candidates: 0,
    backfilled: 0,
    archived: { max_age: 0, trend_floor: 0, source_removed: 0 },
    deleted: 0,
    overrides_removed: 0,
    tombstones_written: 0,
  };
  let topLevelError: string | undefined;

  try {
    // Idempotent — only matches rows that predate this feature; a no-op on every subsequent run.
    const backfillResult = await NewsItem.updateMany({ lifecycle: { $exists: false } }, { $set: { lifecycle: 'active' } });
    counts.backfilled = backfillResult.modifiedCount ?? 0;

    const now = new Date();
    const maxAgeCutoff = new Date(now.getTime() - config.news_ingestion.retention.max_age_hours * 60 * 60 * 1000);
    const minAgeCutoff = new Date(now.getTime() - config.news_ingestion.retention.min_age_hours * 60 * 60 * 1000);
    const recentOverrideCutoff = new Date(now.getTime() - RECENT_OVERRIDE_PROTECTION_DAYS * 24 * 60 * 60 * 1000);
    const freshNeedsReviewCutoff = new Date(now.getTime() - FRESH_NEEDS_REVIEW_PROTECTION_DAYS * 24 * 60 * 60 * 1000);

    // NewsItemCategoryOverride stores news_item_id as a plain String; map to ObjectId for the
    // _id comparison below.
    const recentlyOverriddenIds = await NewsItemCategoryOverride.distinct('news_item_id', {
      overridden_at: { $gte: recentOverrideCutoff },
    });
    const recentlyOverriddenObjectIds = (recentlyOverriddenIds as unknown[])
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    // Composable guard clauses (design.md decision 7): a future story-liveness protection lands
    // here as a third array entry, no restructuring needed.
    const protectionClauses: FilterQuery<INewsItem>[] = [
      { _id: { $in: recentlyOverriddenObjectIds } },
      { needs_review: true, created_at: { $gte: freshNeedsReviewCutoff } },
    ];

    const archiveCandidates = await NewsItem.find(
      {
        lifecycle: 'active',
        $nor: protectionClauses,
        $or: [
          { created_at: { $lt: maxAgeCutoff } },
          {
            created_at: { $lt: minAgeCutoff },
            current_trend_score: { $lt: config.news_ingestion.retention.trend_floor },
            ...engagementSignalClause,
          },
          { source_removed: true },
        ],
      },
      { _id: 1, created_at: 1, source_removed: 1 },
    )
      .limit(ARCHIVE_BATCH_CAP)
      .lean<ArchiveCandidate[]>();

    counts.candidates = archiveCandidates.length;

    const archiveOps: BulkOps = archiveCandidates.map((item) => {
      // Precedence when an item matches more than one condition: source_removed is the
      // strongest, independent signal; max_age is a hard ceiling regardless of score;
      // trend_floor is the only remaining case the $or above could have matched.
      const reason: ArchiveReason = item.source_removed
        ? 'source_removed'
        : item.created_at < maxAgeCutoff
          ? 'max_age'
          : 'trend_floor';
      counts.archived[reason] += 1;
      return {
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { lifecycle: 'archived', archived_at: now, archive_reason: reason } },
        },
      };
    });

    if (archiveOps.length > 0) {
      await NewsItem.bulkWrite(archiveOps as Parameters<typeof NewsItem.bulkWrite>[0], { ordered: false });
    }

    // Stage 2 — hard-delete items past the cooling-off window, cascading per batch:
    // tombstone -> override cleanup -> item delete. A crash between steps is safe (dedup-
    // tombstone-ledger design.md decision 1) — the next run re-selects the still-archived items.
    const deleteCutoff = new Date(now.getTime() - config.news_ingestion.retention.delete_after_days * 24 * 60 * 60 * 1000);
    const toDelete = await NewsItem.find(
      { lifecycle: 'archived', archived_at: { $lt: deleteCutoff } },
      { _id: 1, content_hash: 1, title: 1, source: 1 },
    ).lean<DeleteCandidate[]>();

    for (const batch of chunk(toDelete, DELETE_BATCH_SIZE)) {
      await recordTombstones(batch.map((item) => ({ content_hash: item.content_hash, title: item.title, source: item.source })));
      counts.tombstones_written += batch.length;

      const batchIds = batch.map((item) => item._id);
      const overrideResult = await NewsItemCategoryOverride.deleteMany({ news_item_id: { $in: batchIds.map(String) } });
      counts.overrides_removed += overrideResult.deletedCount ?? 0;

      // Per-team scores are meaningless once their item is gone, and nothing else would ever collect
      // them — same reasoning as the override cleanup directly above.
      await NewsItemTeamScoreService.deleteScoresForItems(batchIds as Types.ObjectId[]);

      const deleteResult = await NewsItem.deleteMany({ _id: { $in: batchIds } });
      counts.deleted += deleteResult.deletedCount ?? 0;
    }
  } catch (err) {
    topLevelError = err instanceof Error ? err.message : String(err);
    logger.error({ err: topLevelError }, '[NewsRetention] retention run failed');
  }

  await persistMaintenanceRun({ started_at, counts, error: topLevelError });
};
