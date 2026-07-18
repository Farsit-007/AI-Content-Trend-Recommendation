import config from '../config';
import { logger } from './logger';
import { openrouter } from './openrouterClient';

/**
 * Conservative char cap for embedding input. The model's actual limit is 8192 *tokens*; using
 * chars keeps this dependency-free, and 6000 chars stays well under 8192 tokens even for
 * pathologically token-dense text (e.g. dense non-Latin scripts, ~1 char/token worst case).
 * Some sources pass through full unbounded article text —
 * without a cap, one oversized item throws the whole request (single call) or the whole batch
 * (`embedBatch`) rather than just failing to embed that one item well.
 */
const MAX_INPUT_CHARS = 6000;

export const embed = async (text: string): Promise<number[]> => {
  const response = await openrouter.embeddings.create({
    model: config.embedding_model as string,
    input: text.slice(0, MAX_INPUT_CHARS),
  });

  const vector = response.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error('OpenRouter embedding response did not contain a vector');
  }
  return vector;
};

/**
 * Batches multiple texts into one embeddings call. Callers with high item counts (e.g. news
 * ingestion) must not fire one HTTP request per item via `Promise.all` — that floods OpenRouter
 * with concurrent requests and the provider intermittently answers with a malformed/error body
 * under that burst load. One request per batch keeps concurrent request volume bounded.
 */
export const embedBatch = async (texts: string[]): Promise<number[][]> => {
  if (texts.length === 0) return [];

  const response = await openrouter.embeddings.create({
    model: config.embedding_model as string,
    input: texts.map((text) => text.slice(0, MAX_INPUT_CHARS)),
  });

  const vectors = response.data?.map((entry) => entry.embedding);
  if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v))) {
    logger.error({ response }, '[embeddings] OpenRouter batch response did not contain the expected vectors');
    throw new Error('OpenRouter embedding response did not contain the expected vectors');
  }
  return vectors;
};
