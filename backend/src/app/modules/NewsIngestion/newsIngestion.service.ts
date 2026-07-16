import config from '../../config';
import { embed } from '../../lib/embeddings';
import { logger } from '../../lib/logger';
import { NewsItem } from '../NewsItem/newsItem.model';
import { ISourceRunCount } from '../IngestionRun/ingestionRun.interface';
import { IngestionRun } from '../IngestionRun/ingestionRun.model';
import { runAllAdapters } from './adapters';
import { categorizeBatch } from './newsIngestion.categorize';
import {
  CategorizedNewsItem,
  IngestionSummary,
  ScoredCategorizedNewsItem,
  ScoredNewsItem,
  SourceSummary,
} from './newsIngestion.interface';
import { computeOpportunityScore, fetchBrandVoicePool, scoreRelevance, scoreTrend } from './newsIngestion.scoring';
import {
  EmbeddedNewsItem,
  HashedNewsItem,
  attachContentHash,
  dedupeAgainstStored,
  dedupeSemantic,
  fetchRecentEmbeddings,
  filterFresh,
} from './newsIngestion.utils';

const countBySource = (items: { source: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.source] = (counts[item.source] ?? 0) + 1;
  }
  return counts;
};

/**
 * Adapters may emit items under more source labels than their own adapter name (e.g. the RSS
 * adapter labels items `rss:<hostname>` per feed). The summary must cover both the adapter names
 * (so a source that errored or fetched nothing still gets a zero-count row) and every label that
 * actually appeared on an item, in that order.
 */
export const unionSourceKeys = (adapterSources: string[], itemSourceKeys: string[]): string[] => {
  const seen = new Set(adapterSources);
  const ordered = [...adapterSources];
  for (const key of itemSourceKeys) {
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
};

export const buildSourceSummaries = (
  adapterSources: string[],
  fetchedCounts: Record<string, number>,
  freshCounts: Record<string, number>,
  uniqueCounts: Record<string, number>,
  relevantCounts: Record<string, number>,
): SourceSummary[] => {
  const sources = unionSourceKeys(adapterSources, Object.keys(fetchedCounts));
  // Per-source "stored" reflects items attempted for storage post-scoring, not the verified
  // per-source insert outcome — acceptable since insert failures are rare races, not the norm.
  return sources.map((source) => ({
    source,
    fetched: fetchedCounts[source] ?? 0,
    deduped: (freshCounts[source] ?? 0) - (uniqueCounts[source] ?? 0),
    discarded:
      (fetchedCounts[source] ?? 0) - (freshCounts[source] ?? 0) + ((uniqueCounts[source] ?? 0) - (relevantCounts[source] ?? 0)),
    stored: relevantCounts[source] ?? 0,
  }));
};

/**
 * Same per-source union as `buildSourceSummaries`, but broken into all six pipeline layers
 * (including semantic dedup, which the HTTP-facing summary doesn't surface) for persistence in
 * `IngestionRun`. Called for both a completed run and a run aborted mid-pipeline.
 *
 * Layers the pipeline never reached at abort time are passed as `undefined`, not `{}` — the two
 * are not equivalent. `{}` would mean "this layer ran and dropped everything," which is false and
 * would misrepresent a crash as a 100% drop. `undefined` means "unknown," so that layer's dropped
 * count is 0 and its item count carries forward unchanged from the last layer that did complete.
 */
export const buildSourceRunCounts = (
  adapterSources: string[],
  fetchedCounts: Record<string, number>,
  freshCounts: Record<string, number> | undefined,
  uniqueCounts: Record<string, number> | undefined,
  dedupedCounts: Record<string, number> | undefined,
  relevantCounts: Record<string, number> | undefined,
  errorsBySource: Record<string, string>,
): ISourceRunCount[] => {
  const sources = unionSourceKeys(adapterSources, Object.keys(fetchedCounts));
  return sources.map((source) => {
    const fetched = fetchedCounts[source] ?? 0;
    const afterFresh = freshCounts ? (freshCounts[source] ?? 0) : fetched;
    const afterUnique = uniqueCounts ? (uniqueCounts[source] ?? 0) : afterFresh;
    const afterDeduped = dedupedCounts ? (dedupedCounts[source] ?? 0) : afterUnique;
    const afterRelevant = relevantCounts ? (relevantCounts[source] ?? 0) : afterDeduped;

    return {
      source,
      fetched,
      fresh_dropped: fetched - afterFresh,
      hash_deduped: afterFresh - afterUnique,
      semantic_deduped: afterUnique - afterDeduped,
      relevance_dropped: afterDeduped - afterRelevant,
      // Layer 4 (categorize + store) never even attempted this source unless relevance filtering
      // itself completed — reporting afterRelevant as "stored" here would claim items were stored
      // that the pipeline never got to.
      stored: relevantCounts ? afterRelevant : 0,
      error: errorsBySource[source],
    };
  });
};

interface RunCountState {
  started_at: Date;
  trigger: 'cron' | 'manual';
  adapterSources: string[];
  fetchedCounts: Record<string, number>;
  freshCounts: Record<string, number> | undefined;
  uniqueCounts: Record<string, number> | undefined;
  dedupedCounts: Record<string, number> | undefined;
  relevantCounts: Record<string, number> | undefined;
  errorsBySource: Record<string, string>;
  totalStored: number;
  topLevelError?: string;
}

/**
 * Persists one `IngestionRun` document per run — success or crash alike (see design.md decision
 * 1: a gap in run history reintroduces the exact "did this even run?" blind spot this capability
 * exists to close). Never throws: a failed write must not affect the pipeline's own outcome.
 */
const persistRun = async (state: RunCountState): Promise<void> => {
  try {
    const finished_at = new Date();
    const sources = buildSourceRunCounts(
      state.adapterSources,
      state.fetchedCounts,
      state.freshCounts,
      state.uniqueCounts,
      state.dedupedCounts,
      state.relevantCounts,
      state.errorsBySource,
    );
    await IngestionRun.create({
      started_at: state.started_at,
      finished_at,
      duration_ms: finished_at.getTime() - state.started_at.getTime(),
      trigger: state.trigger,
      total_stored: state.totalStored,
      sources,
      error: state.topLevelError,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] failed to persist IngestionRun');
  }
};

export const runIngestionPipeline = async (trigger: 'cron' | 'manual'): Promise<IngestionSummary> => {
  const started_at = new Date();
  let adapterSources: string[] = [];
  let errorsBySource: Record<string, string> = {};
  let fetchedCounts: Record<string, number> = {};
  let freshCounts: Record<string, number> | undefined;
  let uniqueCounts: Record<string, number> | undefined;
  let dedupedCounts: Record<string, number> | undefined;
  let relevantCounts: Record<string, number> | undefined;
  let totalStored = 0;

  try {
    // Layer 1: Fetch & Normalize
    const adapterResults = await runAllAdapters();
    adapterSources = adapterResults.map((r) => r.source);
    errorsBySource = Object.fromEntries(
      adapterResults.filter((r): r is typeof r & { error: string } => Boolean(r.error)).map((r) => [r.source, r.error]),
    );
    fetchedCounts = countBySource(adapterResults.flatMap((r) => r.items));

    // Layer 2: Dedupe & Freshness
    const hashed: HashedNewsItem[] = attachContentHash(adapterResults.flatMap((r) => r.items));
    const fresh = filterFresh(hashed, config.news_ingestion.max_age_hours);
    freshCounts = countBySource(fresh);

    const unique = await dedupeAgainstStored(fresh);
    uniqueCounts = countBySource(unique);

    // Layer 2b: Semantic Dedup (cross-source, same story under different URLs)
    const embedded: EmbeddedNewsItem[] = await Promise.all(
      unique.map(async (item) => ({
        ...item,
        embedding: await embed(`${item.title} ${item.snippet ?? ''}`.trim()),
      })),
    );

    const dedupCutoff = new Date(Date.now() - config.news_ingestion.max_age_hours * 60 * 60 * 1000);
    const recentPool = await fetchRecentEmbeddings(dedupCutoff);
    const deduped = dedupeSemantic(embedded, recentPool, config.news_ingestion.semantic_dedup_threshold);
    dedupedCounts = countBySource(deduped);
    logger.info(
      `[NewsIngestion] semantic dedup: ${embedded.length} candidates -> ${deduped.length} survived ` +
        `(${embedded.length - deduped.length} dropped, recent pool size ${recentPool.length})`,
    );

    // Layer 3: Relevance & Trend Scoring
    const brandVoicePool = await fetchBrandVoicePool();
    const scored: ScoredNewsItem[] = deduped.map((item) => ({
      ...item,
      relevance_score: scoreRelevance(item.embedding, brandVoicePool),
      trend_score: scoreTrend(item.raw_points, item.raw_comments, item.raw_stars_delta),
    }));

    // Cold start: skip relevance filtering entirely when no brand voice examples exist yet.
    const relevant =
      brandVoicePool.length === 0
        ? scored
        : scored.filter((item) => (item.relevance_score ?? 0) >= config.news_ingestion.min_relevance);
    relevantCounts = countBySource(relevant);

    // Layer 4: Categorize & Score Opportunity
    const categorized: CategorizedNewsItem[] = await categorizeBatch(relevant);
    const finalized: ScoredCategorizedNewsItem[] = categorized.map((item) => ({
      ...item,
      opportunity_score: computeOpportunityScore(item.relevance_score, item.trend_score, item.audience_fit, config.news_ingestion),
      needs_review: item.category_confidence < config.news_ingestion.category_confidence_threshold,
    }));

    const payloads = finalized.map((item) => ({
      source: item.source,
      source_id: item.source_id,
      content_hash: item.content_hash,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      published_at: item.published_at,
      engagement: {
        points: item.raw_points,
        comments: item.raw_comments,
        stars_delta: item.raw_stars_delta,
      },
      trend_score: item.trend_score,
      category: item.category,
      relevance_score: item.relevance_score,
      impact_note: item.impact_note,
      embedding: item.embedding,
      opportunity_score: item.opportunity_score,
      category_confidence: item.category_confidence,
      needs_review: item.needs_review,
      processed: true,
    }));

    if (payloads.length > 0) {
      try {
        const result = await NewsItem.insertMany(payloads, { ordered: false });
        totalStored = result.length;
      } catch (err) {
        // A duplicate-key race (another run inserted the same content_hash between our dedupe
        // check and this insert) is possible; ordered:false means every other document still
        // gets attempted, and mongoose reports the ones that succeeded here.
        const bulkErr = err as { insertedDocs?: unknown[] };
        totalStored = bulkErr.insertedDocs?.length ?? 0;
        logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] insertMany reported errors');
      }
    }

    const summaries = buildSourceSummaries(adapterSources, fetchedCounts, freshCounts, uniqueCounts, relevantCounts);

    await persistRun({
      started_at,
      trigger,
      adapterSources,
      fetchedCounts,
      freshCounts,
      uniqueCounts,
      dedupedCounts,
      relevantCounts,
      errorsBySource,
      totalStored,
    });

    return { sources: summaries, totalStored };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await persistRun({
      started_at,
      trigger,
      adapterSources,
      fetchedCounts,
      freshCounts,
      uniqueCounts,
      dedupedCounts,
      relevantCounts,
      errorsBySource,
      totalStored,
      topLevelError: message,
    });
    throw err;
  }
};
