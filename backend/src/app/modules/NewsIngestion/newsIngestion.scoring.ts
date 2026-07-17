import config from '../../config';
import { cosineSimilarity } from '../../lib/similarity';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { REFRESHABLE_SOURCES } from '../NewsRefresh/newsRefresh.fetchers';

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

interface EngagementSnapshot {
  at: Date;
  points: number;
  comments: number;
  stars_delta: number;
}

interface TrendScoreInput {
  engagement: { points: number; comments: number; stars_delta: number };
  published_at?: Date;
  created_at: Date;
  engagement_history?: EngagementSnapshot[];
}

/** Same weighting as `scoreTrend`'s log argument (minus the `+1` floor), used to compare two
 * snapshots for velocity. */
const weightedEngagement = (e: { points: number; comments: number; stars_delta: number }): number =>
  e.points + e.comments * 2 + e.stars_delta * 3;

/**
 * Decayed, velocity-aware live trend score (design.md decision 1). Pure and side-effect-free
 * so it can be called from any context (ingest, refresh job, a future corroboration merge)
 * without inheriting caller-specific state — `now` and the item snapshot are the only inputs.
 */
export const computeCurrentTrendScore = (item: TrendScoreInput, now: Date): number => {
  const base = scoreTrend(item.engagement.points, item.engagement.comments, item.engagement.stars_delta);

  const ageHours = (now.getTime() - (item.published_at ?? item.created_at).getTime()) / 3_600_000;
  const decay = Math.exp(-ageHours / config.news_ingestion.trend_decay.tau_hours);

  const history = item.engagement_history ?? [];
  let velocity = 0;
  if (history.length >= 2) {
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    const hoursBetween = Math.max((last.at.getTime() - prev.at.getTime()) / 3_600_000, 1);
    velocity = Math.max(0, (weightedEngagement(last) - weightedEngagement(prev)) / hoursBetween);
  }

  const score = base * decay + config.news_ingestion.trend_decay.velocity_bonus * Math.log10(1 + velocity);
  return round1(Math.min(10, Math.max(0, score)));
};

/**
 * True iff the item's engagement is trustworthy as a "this could still be trending" signal:
 * either its source supports cheap re-polling (so the number is kept fresh), or it already
 * shows nonzero weighted engagement (e.g. GitHub star deltas, which aren't re-polled but were
 * real at ingest). Not stored — derived on demand by callers (design.md decision 1).
 */
export const hasEngagementSignal = (item: {
  source: string;
  engagement: { points: number; comments: number; stars_delta: number };
}): boolean => REFRESHABLE_SOURCES.includes(item.source) || weightedEngagement(item.engagement) > 0;

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
