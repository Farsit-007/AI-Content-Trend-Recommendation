import cron from 'node-cron';
import config from '../config';
import { runIngestionPipeline } from '../modules/NewsIngestion/newsIngestion.service';

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
