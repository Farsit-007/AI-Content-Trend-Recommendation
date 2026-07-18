import config from '../../config';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { IMaintenanceRunCounts } from '../MaintenanceRun/maintenanceRun.interface';
import { MaintenanceRun } from '../MaintenanceRun/maintenanceRun.model';
import { computeCurrentTrendScore } from '../NewsIngestion/newsIngestion.scoring';
import { NewsItem } from '../NewsItem/newsItem.model';
import { ENGAGEMENT_FETCHERS, REFRESHABLE_SOURCES } from './newsRefresh.fetchers';

const LOCK_KEY = 'lock:news_refresh';
const LOCK_TTL_MS = 55 * 60 * 1000;
const HISTORY_SLICE = -32;

// Mongoose's `PushOperator` type can't express `$each` + `$slice` on an optional subdocument
// array field, so bulk update payloads are built loosely and cast at the `bulkWrite` call site.
type BulkOps = { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[];

export interface Candidate {
  _id: unknown;
  source: string;
  source_id: string;
  created_at: Date;
  published_at?: Date;
  engagement: { points: number; comments: number; stars_delta: number };
  engagement_history?: { at: Date; points: number; comments: number; stars_delta: number }[];
}

/** Walks youngest-first candidates, stopping the instant the next item's cost would exceed the
 * remaining budget — older items past that point are simply not refreshed this run. Each
 * candidate costs 1 request (hackernews/devto are 1 request/item). Actual request counts
 * persisted to `maintenance_runs` come from what each fetcher reports having issued, not this
 * estimate. Exported for direct unit testing (see newsRefresh.service.test.ts). */
export const selectWithinBudget = (candidates: Candidate[], maxRequests: number): Record<string, Candidate[]> => {
  const selected: Record<string, Candidate[]> = {};
  let remaining = maxRequests;

  for (const candidate of candidates) {
    if (remaining <= 0) break;
    remaining -= 1;
    (selected[candidate.source] ??= []).push(candidate);
  }
  return selected;
};

/** Persists one `maintenance_runs` document per run, success or failure alike (mirrors
 * `newsIngestion.service.ts`'s `persistRun`). Never throws: a failed write must not affect the
 * refresh job's own outcome. */
const persistMaintenanceRun = async (state: { started_at: Date; counts: IMaintenanceRunCounts; error?: string }): Promise<void> => {
  try {
    const finished_at = new Date();
    await MaintenanceRun.create({
      job: 'engagement_refresh',
      started_at: state.started_at,
      finished_at,
      duration_ms: finished_at.getTime() - state.started_at.getTime(),
      counts: state.counts,
      error: state.error,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[NewsRefresh] failed to persist MaintenanceRun');
  }
};

export const runEngagementRefresh = async (): Promise<void> => {
  const started_at = new Date();

  // Expire-only release (no compare-and-delete): the PX window is well under the hourly cron
  // period, which is sufficient here and keeps the lock logic simple (design.md decision 6).
  const acquired = await redis.set(LOCK_KEY, String(started_at.getTime()), 'PX', LOCK_TTL_MS, 'NX');
  if (!acquired) {
    logger.info('[NewsRefresh] Another refresh run holds the lock — skipping');
    return;
  }

  const counts: IMaintenanceRunCounts = { candidates: 0, refreshed: 0, source_removed: 0, request_count: 0, errors: {} };
  let topLevelError: string | undefined;

  try {
    // Idempotent — only matches rows that have never had a score computed (pre-dates this
    // feature); a no-op on every subsequent run. Folded into the refresh job rather than a
    // separate migration (design.md decision 3).
    await NewsItem.updateMany({ current_trend_score: { $exists: false } }, [
      { $set: { current_trend_score: '$trend_score' } },
    ]);

    const windowCutoff = new Date(Date.now() - config.news_ingestion.refresh.window_hours * 60 * 60 * 1000);
    const candidates = await NewsItem.find(
      {
        created_at: { $gte: windowCutoff },
        source: { $in: REFRESHABLE_SOURCES },
        lifecycle: { $ne: 'archived' },
      },
      { _id: 1, source: 1, source_id: 1, created_at: 1, published_at: 1, engagement: 1, engagement_history: 1 },
    )
      .sort({ created_at: -1 })
      .lean<Candidate[]>();

    counts.candidates = candidates.length;

    const selected = selectWithinBudget(candidates, config.news_ingestion.refresh.max_requests);
    const now = new Date();
    const bulkOps: BulkOps = [];

    for (const [source, items] of Object.entries(selected)) {
      if (items.length === 0) continue;
      const fetcher = ENGAGEMENT_FETCHERS[source];

      try {
        const { results, requestsUsed } = await fetcher(items.map((item) => ({ source_id: item.source_id })));
        counts.request_count += requestsUsed;

        const bySourceId = new Map(items.map((item) => [item.source_id, item]));
        for (const result of results) {
          const candidate = bySourceId.get(result.source_id);
          if (!candidate) continue;

          if (result.removed) {
            counts.source_removed += 1;
            // Decay still advances even though there's no new engagement snapshot to append.
            const current_trend_score = computeCurrentTrendScore(
              {
                engagement: candidate.engagement,
                published_at: candidate.published_at,
                created_at: candidate.created_at,
                engagement_history: candidate.engagement_history,
              },
              now,
            );
            bulkOps.push({
              updateOne: { filter: { _id: candidate._id }, update: { $set: { source_removed: true, current_trend_score } } },
            });
            continue;
          }

          const snapshot = { at: now, points: result.points, comments: result.comments, stars_delta: result.stars_delta };
          // First-touch: prepend the ingest-time snapshot so velocity is computable after this
          // single refresh instead of requiring two (design.md decision 7).
          const historyToPush = candidate.engagement_history?.length
            ? [snapshot]
            : [{ at: candidate.created_at, ...candidate.engagement }, snapshot];

          const current_trend_score = computeCurrentTrendScore(
            {
              engagement: { points: result.points, comments: result.comments, stars_delta: result.stars_delta },
              published_at: candidate.published_at,
              created_at: candidate.created_at,
              engagement_history: [...(candidate.engagement_history ?? []), ...historyToPush],
            },
            now,
          );

          bulkOps.push({
            updateOne: {
              filter: { _id: candidate._id },
              update: {
                $set: {
                  'engagement.points': result.points,
                  'engagement.comments': result.comments,
                  'engagement.stars_delta': result.stars_delta,
                  engagement_refreshed_at: now,
                  current_trend_score,
                },
                $push: { engagement_history: { $each: historyToPush, $slice: HISTORY_SLICE } },
              },
            },
          });
          counts.refreshed += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        counts.errors[source] = message;
        logger.error({ err: message }, `[NewsRefresh] ${source} refresh failed`);
      }
    }

    if (bulkOps.length > 0) {
      await NewsItem.bulkWrite(bulkOps as Parameters<typeof NewsItem.bulkWrite>[0], { ordered: false });
    }
  } catch (err) {
    topLevelError = err instanceof Error ? err.message : String(err);
    logger.error({ err: topLevelError }, '[NewsRefresh] engagement refresh run failed');
  }

  await persistMaintenanceRun({ started_at, counts, error: topLevelError });
};
