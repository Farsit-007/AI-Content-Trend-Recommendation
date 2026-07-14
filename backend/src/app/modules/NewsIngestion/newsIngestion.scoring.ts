import { cosineSimilarity } from '../../lib/similarity';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';

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

interface OpportunityWeights {
  opportunity_weight_relevance: number;
  opportunity_weight_trend: number;
  opportunity_weight_fit: number;
  opportunity_fallback_relevance: number;
}

/**
 * Deterministic so identical relevance/trend/fit inputs always produce the same score — the LLM
 * only supplies `audienceFit` (bounded 0-1); it no longer picks the final number itself.
 * `relevanceScore` is `undefined` during cold start (empty brand-voice pool), in which case the
 * configured fallback stands in for it.
 */
export const computeOpportunityScore = (
  relevanceScore: number | undefined,
  trendScore: number,
  audienceFit: number,
  weights: OpportunityWeights,
): number => {
  const relevance = relevanceScore ?? weights.opportunity_fallback_relevance;
  const score =
    weights.opportunity_weight_relevance * relevance +
    weights.opportunity_weight_trend * trendScore +
    weights.opportunity_weight_fit * (audienceFit * 10);
  return round1(Math.min(10, Math.max(0, score)));
};
