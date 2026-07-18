import mongoose from 'mongoose';
import { logger } from './logger';
import { pingRedis } from './redis';
import { chatCompletionForTask, embedForTask, LlmNotConfiguredError } from './modelResolution';

const withLabel = async (label: string, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
    logger.info(`[verifyConnections] ${label}: OK`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[verifyConnections] ${label} FAILED: ${message}`);
  }
};

/**
 * Fails fast and loud if Mongo, Redis, or the LLM/embedding clients are
 * misconfigured — critical fixes #1 and #2 exist precisely so this doesn't
 * get discovered mid-integration on demo day.
 */
export const verifyConnections = async (): Promise<void> => {
  await withLabel('MongoDB (Atlas)', async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Mongoose connection not established');
    await db.admin().ping();
  });

  await withLabel('Redis', pingRedis);

  // Smoke-tests whatever resolveModelForTask picks (request/team/global DB tiers, or the
  // test-only bootstrap env key). A deployment with no provider configured yet is expected
  // during first-run setup — warn and continue so the admin can add one through the UI.
  await withLabel('LLM chat completion', async () => {
    try {
      await chatCompletionForTask('content_generation', [{ role: 'user', content: 'Reply with exactly: OK' }]);
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        logger.warn(`[verifyConnections] ${err.message} — skipping LLM smoke test`);
        return;
      }
      throw err;
    }
  });

  await withLabel('Embeddings', async () => {
    try {
      const vector = await embedForTask('embedding', 'connectivity check');
      if (!vector.length) throw new Error('Embedding provider returned an empty vector');
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        logger.warn(`[verifyConnections] ${err.message} — skipping embedding smoke test`);
        return;
      }
      throw err;
    }
  });
};
