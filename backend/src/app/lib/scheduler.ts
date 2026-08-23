import cron from 'node-cron';
import config from '../config';
import { runAutoGeneration } from '../modules/GeneratedContent/generatedContent.job';
import {
  IngestionAlreadyRunningError,
  runIngestionPipeline,
} from '../modules/NewsIngestion/newsIngestion.service';
import { runEngagementRefresh } from '../modules/NewsRefresh/newsRefresh.service';
import { runNewsRetention } from '../modules/NewsRetention/newsRetention.service';
import { reportError } from './errorReporting';
import { logger } from './logger';
import { redis } from './redis';

/**
 * Runs in-process rather than as a separate worker — acceptable at this scale
 * (a handful of LLM calls every few hours). A failed run must not crash the
 * API server, so the whole callback is try/caught and only logged.
 *
 * **Cross-replica exclusivity**, stated here because it is easy to get wrong by omission: node-cron
 * timers live in the process, so N replicas each register their own copy of every job below and all
 * of them fire on the same tick.
 *
 * Three of the four are already safe, and not by accident — ingestion, engagement refresh, and
 * retention each take a Redis `SET NX` lock *inside their own service function*
 * (`lock:news_ingestion`, `lock:news_refresh`, `lock:news_retention`). Because the lock is in Redis
 * rather than process memory it serializes across replicas, and it also covers the manual-trigger
 * path, which a scheduler-level wrapper could not see.
 *
 * Auto-generation had no such lock. Left alone, every replica would pull the same eligible news
 * items and generate the same drafts concurrently — duplicate content and multiplied LLM spend, with
 * nothing failing loudly enough to notice. `withSchedulerLock` closes that one gap; the other three
 * are deliberately *not* wrapped, since double-locking adds a moving part and no guarantee.
 */

const AUTO_GENERATION_LOCK_KEY = 'lock:scheduler:auto_generation';

/**
 * Longer than a full run (bounded by the per-run generation cap) so a slow run is never pre-empted
 * by its own next tick, but short enough that a replica dying mid-run costs one cycle rather than
 * blocking auto-generation until someone notices.
 */
const AUTO_GENERATION_LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Runs `job` on exactly one replica per tick.
 *
 * Fails **closed** on a Redis error — `redis.set` rejecting means we cannot prove we hold the lock,
 * and for a job that spends money the safe reading of "unknown" is "someone else might be running".
 * That is the opposite of the cache layer's fail-open stance, and deliberately so: a skipped
 * generation cycle costs nothing, a duplicated one costs real money.
 */
const withSchedulerLock = async (
  key: string,
  ttlMs: number,
  job: () => Promise<void>,
): Promise<void> => {
  let acquired: string | null;
  try {
    acquired = await redis.set(key, String(Date.now()), 'PX', ttlMs, 'NX');
  } catch (err) {
    // Reported, not just logged: a sustained Redis outage would otherwise starve this job
    // indefinitely with nothing surfacing outside raw logs.
    reportError(err, { source: 'scheduler:lock', key });
    logger.warn(
      { err: err instanceof Error ? err.message : err, key },
      '[scheduler] Could not acquire the lock — skipping this tick rather than risking a duplicate run',
    );
    return;
  }

  if (!acquired) {
    logger.info(
      { key },
      '[scheduler] Skipped — another replica holds the lock',
    );
    return;
  }

  try {
    await job();
  } finally {
    // Best-effort release: a failure here just means the next tick waits for the TTL.
    await redis.del(key).catch(() => undefined);
  }
};

/** Self-guards via its own `lock:news_ingestion` — see the module comment above. */
export const startNewsIngestionScheduler = (): void => {
  cron.schedule(config.news_ingestion.cron, async () => {
    logger.info('[scheduler] Running scheduled news ingestion...');
    try {
      const summary = await runIngestionPipeline('cron');
      logger.info({ summary }, '[scheduler] News ingestion complete');
    } catch (err) {
      // Lock contention is an expected outcome (a manual run or another replica is mid-pipeline),
      // not a failure — logging it at error level would train the team to ignore this line.
      if (err instanceof IngestionAlreadyRunningError) {
        logger.info(
          '[scheduler] News ingestion skipped — a run is already in progress',
        );
        return;
      }
      reportError(err, { source: 'scheduler:news-ingestion' });
      logger.error(
        { err: err instanceof Error ? err.message : err },
        '[scheduler] News ingestion failed',
      );
    }
  });
  logger.info(
    `[scheduler] News ingestion scheduled: ${config.news_ingestion.cron}`,
  );
};

/** The one scheduled job with no lock of its own — see the module comment above. */
export const startAutoGenerationScheduler = (): void => {
  cron.schedule(config.auto_generation.cron, () =>
    withSchedulerLock(
      AUTO_GENERATION_LOCK_KEY,
      AUTO_GENERATION_LOCK_TTL_MS,
      async () => {
        logger.info('[scheduler] Running scheduled auto-generation...');
        try {
          const summary = await runAutoGeneration();
          logger.info({ summary }, '[scheduler] Auto-generation complete');
        } catch (err) {
          reportError(err, { source: 'scheduler:auto-generation' });
          logger.error(
            { err: err instanceof Error ? err.message : err },
            '[scheduler] Auto-generation failed',
          );
        }
      },
    ),
  );
  logger.info(
    `[scheduler] Auto-generation scheduled: ${config.auto_generation.cron}`,
  );
};

/** Self-guards via its own `lock:news_refresh`. */
export const startEngagementRefreshScheduler = (): void => {
  cron.schedule(config.news_ingestion.refresh.cron, async () => {
    logger.info('[scheduler] Running scheduled engagement refresh...');
    try {
      await runEngagementRefresh();
      logger.info('[scheduler] Engagement refresh complete');
    } catch (err) {
      reportError(err, { source: 'scheduler:engagement-refresh' });
      logger.error(
        { err: err instanceof Error ? err.message : err },
        '[scheduler] Engagement refresh failed',
      );
    }
  });
  logger.info(
    `[scheduler] Engagement refresh scheduled: ${config.news_ingestion.refresh.cron}`,
  );
};

/** Self-guards via its own `lock:news_retention`. */
export const startNewsRetentionScheduler = (): void => {
  cron.schedule(config.news_ingestion.retention.cron, async () => {
    logger.info('[scheduler] Running scheduled news retention...');
    try {
      await runNewsRetention();
      logger.info('[scheduler] News retention complete');
    } catch (err) {
      reportError(err, { source: 'scheduler:news-retention' });
      logger.error(
        { err: err instanceof Error ? err.message : err },
        '[scheduler] News retention failed',
      );
    }
  });
  logger.info(
    `[scheduler] News retention scheduled: ${config.news_ingestion.retention.cron}`,
  );
};
