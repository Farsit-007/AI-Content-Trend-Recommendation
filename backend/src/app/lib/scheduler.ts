import cron from 'node-cron';
import config from '../config';
import { runAutoGeneration } from '../modules/GeneratedContent/generatedContent.job';
import { runIngestionPipeline } from '../modules/NewsIngestion/newsIngestion.service';
import { runEngagementRefresh } from '../modules/NewsRefresh/newsRefresh.service';
import { runNewsRetention } from '../modules/NewsRetention/newsRetention.service';
import { logger } from './logger';

/**
 * Runs in-process rather than as a separate worker — acceptable at this scale
 * (a handful of LLM calls every few hours). A failed run must not crash the
 * API server, so the whole callback is try/caught and only logged.
 */
export const startNewsIngestionScheduler = (): void => {
  cron.schedule(config.news_ingestion.cron, async () => {
    logger.info('[scheduler] Running scheduled news ingestion...');
    try {
      const summary = await runIngestionPipeline('cron');
      logger.info({ summary }, '[scheduler] News ingestion complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] News ingestion failed');
    }
  });
  logger.info(`[scheduler] News ingestion scheduled: ${config.news_ingestion.cron}`);
};

export const startAutoGenerationScheduler = (): void => {
  cron.schedule(config.auto_generation.cron, async () => {
    logger.info('[scheduler] Running scheduled auto-generation...');
    try {
      const summary = await runAutoGeneration();
      logger.info({ summary }, '[scheduler] Auto-generation complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] Auto-generation failed');
    }
  });
  logger.info(`[scheduler] Auto-generation scheduled: ${config.auto_generation.cron}`);
};

export const startEngagementRefreshScheduler = (): void => {
  cron.schedule(config.news_ingestion.refresh.cron, async () => {
    logger.info('[scheduler] Running scheduled engagement refresh...');
    try {
      await runEngagementRefresh();
      logger.info('[scheduler] Engagement refresh complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] Engagement refresh failed');
    }
  });
  logger.info(`[scheduler] Engagement refresh scheduled: ${config.news_ingestion.refresh.cron}`);
};

export const startNewsRetentionScheduler = (): void => {
  cron.schedule(config.news_ingestion.retention.cron, async () => {
    logger.info('[scheduler] Running scheduled news retention...');
    try {
      await runNewsRetention();
      logger.info('[scheduler] News retention complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] News retention failed');
    }
  });
  logger.info(`[scheduler] News retention scheduled: ${config.news_ingestion.retention.cron}`);
};
