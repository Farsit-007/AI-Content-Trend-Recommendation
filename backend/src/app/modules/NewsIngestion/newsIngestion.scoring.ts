import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { cosineSimilarity } from './newsIngestion.utils';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const fetchBrandVoicePool = async (): Promise<number[][]> => {
  const examples = await BrandVoiceExample.find({}, { embedding: 1 });
  return examples.map((example) => example.embedding);
};

/**
 * Max similarity rather than average, so a small or lopsided brand-voice pool
 * (e.g. only one team has submitted examples) doesn't drag every item's score
 * down. Returns `undefined` when the pool is empty (cold start) so the caller
 * can skip relevance filtering rather than discarding everything.
 */
export const scoreRelevance = (itemEmbedding: number[], pool: number[][]): number | undefined => {
  if (pool.length === 0) return undefined;
  const best = Math.max(...pool.map((example) => cosineSimilarity(itemEmbedding, example)));
  return round1(Math.max(0, best) * 10);
};

/**
 * Log-scaled because raw engagement magnitudes vary wildly across sources
 * (HN points vs GitHub stars vs Reddit upvotes) — this keeps them comparable
 * on a single 0-10 scale without an LLM round-trip.
 */
export const scoreTrend = (points: number, comments: number, starsDelta: number): number => {
  const weighted = points + comments * 2 + starsDelta * 3 + 1;
  return round1(Math.min(10, Math.log10(weighted) * 3));
};
