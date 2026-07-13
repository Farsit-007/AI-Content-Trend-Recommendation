import mongoose from 'mongoose';
import { pingRedis } from './redis';
import { chatCompletion, LLM_MODELS } from './llmClient';
import { embed } from './embeddings';

const withLabel = async (label: string, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
    console.log(`[verifyConnections] ${label}: OK`);
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

  await withLabel('OpenRouter LLM', async () => {
    await chatCompletion({
      model: LLM_MODELS.fallback,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    });
  });

  await withLabel('Embeddings (OpenRouter)', async () => {
    const vector = await embed('connectivity check');
    if (!vector.length) throw new Error('Embedding provider returned an empty vector');
  });
};
