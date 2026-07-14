import cron from 'node-cron';
import config from '../config';
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
    console.log('[scheduler] Running scheduled news ingestion...');
    try {
      const summary = await runIngestionPipeline();
      console.log('[scheduler] News ingestion complete:', JSON.stringify(summary));
    } catch (err) {
      console.error('[scheduler] News ingestion failed:', err instanceof Error ? err.message : err);
    }
  });
  console.log(`[scheduler] News ingestion scheduled: ${config.news_ingestion.cron}`);
};

export const startAnalyticsScheduler = (): void => {
  cron.schedule(config.analytics.refresh_cron, async () => {
    console.log('[scheduler] Running scheduled analytics refresh...');
    try {
      const summary = await runAnalyticsRefresh();
      console.log('[scheduler] Analytics refresh complete:', JSON.stringify(summary));
    } catch (err) {
      console.error('[scheduler] Analytics refresh failed:', err instanceof Error ? err.message : err);
    }
  });
  console.log(`[scheduler] Analytics refresh scheduled: ${config.analytics.refresh_cron}`);
};

export const startAutoGenerationScheduler = (): void => {
  cron.schedule(config.auto_generation.cron, async () => {
    console.log('[scheduler] Running scheduled auto-generation...');
    try {
      const summary = await runAutoGeneration();
      console.log('[scheduler] Auto-generation complete:', JSON.stringify(summary));
    } catch (err) {
      console.error('[scheduler] Auto-generation failed:', err instanceof Error ? err.message : err);
    }
  });
  console.log(`[scheduler] Auto-generation scheduled: ${config.auto_generation.cron}`);
};
