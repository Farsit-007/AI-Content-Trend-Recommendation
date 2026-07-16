import cron from 'node-cron';
import config from '../config';
import { logger } from './logger';
import { runAutoGeneration } from '../modules/GeneratedContent/generatedContent.job';
import { runIngestionPipeline } from '../modules/NewsIngestion/newsIngestion.service';
import { runAnalyticsRefresh } from '../modules/Analytics/analytics.service';

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

export const startAnalyticsScheduler = (): void => {
  cron.schedule(config.analytics.refresh_cron, async () => {
    logger.info('[scheduler] Running scheduled analytics refresh...');
    try {
      const summary = await runAnalyticsRefresh();
      logger.info({ summary }, '[scheduler] Analytics refresh complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[scheduler] Analytics refresh failed');
    }
  });
  logger.info(`[scheduler] Analytics refresh scheduled: ${config.analytics.refresh_cron}`);
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
