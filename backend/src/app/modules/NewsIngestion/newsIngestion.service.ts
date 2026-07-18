import config from '../../config';
import { logger } from '../../lib/logger';
import { NewsItem } from '../NewsItem/newsItem.model';
import { IAdjudicationCounts, ISourceRunCount } from '../IngestionRun/ingestionRun.interface';
import { IngestionRun } from '../IngestionRun/ingestionRun.model';
import { runAllAdapters } from './adapters';
import { AdjudicationInput, adjudicatePairs, batchesUsed } from './newsIngestion.adjudicate';
import { categorizeBatch } from './newsIngestion.categorize';
import { enrichContent } from './newsIngestion.contentFetch';
import {
  CategorizedNewsItem,
  IngestionSummary,
  ScoredCategorizedNewsItem,
  ScoredNewsItem,
  SourceSummary,
} from './newsIngestion.interface';
import {
  computeCurrentTrendScore,
  computeOpportunityScore,
  fetchBrandVoicePool,
  scoreRelevance,
  scoreTrend,
} from './newsIngestion.scoring';
import {
  CorroborationEvidence,
  DedupSurvivor,
  EmbeddedNewsItem,
  HashedNewsItem,
  SemanticRouting,
  attachContentHash,
  dedupeAgainstStored,
  dedupeSemantic,
  embedItems,
  evidenceFrom,
  fetchRecentEmbeddings,
  filterFresh,
} from './newsIngestion.utils';
import { Types } from 'mongoose';

interface ContentMeta {
  content?: string;
  content_status: 'none' | 'partial' | 'full';
  word_count?: number;
  content_fetched_at?: Date;
}

/** Caps raw adapter-provided content once, centrally, so every source's truncation/status logic is identical. */
export const withContentMeta = (content: string | undefined, maxChars: number): ContentMeta => {
  if (!content) return { content_status: 'none' };

  const capped = content.length > maxChars;
  const text = capped ? content.slice(0, maxChars) : content;
  return {
    content: text,
    content_status: capped ? 'partial' : 'full',
    word_count: text.split(/\s+/).filter(Boolean).length,
    content_fetched_at: new Date(),
  };
};

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
  contentFetchedCounts?: Record<string, number>,
  contentFailedCounts?: Record<string, number>,
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
      content_fetched: contentFetchedCounts?.[source],
      content_failed: contentFailedCounts?.[source],
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
  contentFetchedCounts: Record<string, number> | undefined;
  contentFailedCounts: Record<string, number> | undefined;
  errorsBySource: Record<string, string>;
  adjudication?: IAdjudicationCounts;
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
      state.contentFetchedCounts,
      state.contentFailedCounts,
    );
    await IngestionRun.create({
      started_at: state.started_at,
      finished_at,
      duration_ms: finished_at.getTime() - state.started_at.getTime(),
      trigger: state.trigger,
      total_stored: state.totalStored,
      sources,
      adjudication: state.adjudication,
      error: state.topLevelError,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] failed to persist IngestionRun');
  }
};

const publishedTime = (d?: Date): number => (d ? d.getTime() : Number.POSITIVE_INFINITY);

interface AdjudicationOutcome {
  /** Final semantic-dedup survivors (accepted + gray candidates judged update/distinct). */
  survivors: DedupSurvivor[];
  /** Stored items to corroborate: match _id (string) -> evidence from every dropped duplicate. */
  storedCorroborations: Map<string, CorroborationEvidence[]>;
  counts: IAdjudicationCounts;
}

/**
 * Turns the router's gray pairs into verdicts and applies them (design decision 1: effects live
 * here, not in the pure router). `duplicate` drops the candidate and corroborates its match;
 * `update`/`distinct` keep it; an `update` on an older-than-match candidate is demoted to
 * `distinct` (design decision 3 — never chain backwards). Any fallback/low-confidence verdict
 * keeps the item with `needs_review`. Hard-duplicate drops against stored items corroborate too.
 */
const applyAdjudication = async (routing: SemanticRouting, maxBatches: number): Promise<AdjudicationOutcome> => {
  const survivors: DedupSurvivor[] = [...routing.accepted];
  const storedCorroborations = new Map<string, CorroborationEvidence[]>();
  const addStored = (id: Types.ObjectId, ev: CorroborationEvidence): void => {
    const key = id.toString();
    const list = storedCorroborations.get(key) ?? [];
    list.push(ev);
    storedCorroborations.set(key, list);
  };

  // Hard-duplicate drops against stored items: corroborate, no LLM.
  for (const drop of routing.hardStoredDrops) addStored(drop.matchId, evidenceFrom(drop.candidate));

  const matchPublished = (m: SemanticRouting['grayPairs'][number]['match']): Date | undefined =>
    m.kind === 'stored' ? m.published_at : m.survivor.published_at;

  // Build adjudication inputs with A = older, B = newer by publication time.
  const inputs: AdjudicationInput[] = routing.grayPairs.map((gp, id) => {
    const matchTitle = gp.match.kind === 'stored' ? gp.match.title : gp.match.survivor.title;
    const matchSnippet = gp.match.kind === 'stored' ? gp.match.snippet : gp.match.survivor.snippet;
    const candidateOlder = publishedTime(gp.candidate.published_at) <= publishedTime(matchPublished(gp.match));
    return candidateOlder
      ? { id, olderTitle: gp.candidate.title, olderSnippet: gp.candidate.snippet, newerTitle: matchTitle, newerSnippet: matchSnippet }
      : { id, olderTitle: matchTitle, olderSnippet: matchSnippet, newerTitle: gp.candidate.title, newerSnippet: gp.candidate.snippet };
  });

  const verdicts = await adjudicatePairs(inputs, maxBatches);

  const counts: IAdjudicationCounts = {
    gray_pairs: routing.grayPairs.length,
    batches: batchesUsed(inputs.length, maxBatches),
    verdict_duplicate: 0,
    verdict_update: 0,
    verdict_distinct: 0,
    fallbacks: 0,
  };

  routing.grayPairs.forEach((gp, id) => {
    const result = verdicts.get(id) ?? { verdict: 'update' as const, confidence: 0, fallback: true };
    if (result.fallback) counts.fallbacks += 1;

    // Design decision 3: an update whose candidate is older than the match is stored, not chained.
    let verdict = result.verdict;
    if (verdict === 'update' && publishedTime(gp.candidate.published_at) < publishedTime(matchPublished(gp.match))) {
      verdict = 'distinct';
    }

    if (verdict === 'duplicate') {
      counts.verdict_duplicate += 1;
      const evidence = evidenceFrom(gp.candidate);
      if (gp.match.kind === 'stored') addStored(gp.match.id, evidence);
      else gp.match.survivor.corroborations = [...(gp.match.survivor.corroborations ?? []), evidence];
      return;
    }

    if (verdict === 'update') counts.verdict_update += 1;
    else counts.verdict_distinct += 1;
    const needsReview = result.fallback || result.confidence < 0.5;
    survivors.push(needsReview ? { ...gp.candidate, needs_review_adjudication: true } : { ...gp.candidate });
  });

  return { survivors, storedCorroborations, counts };
};

/**
 * Applies absorbed corroborations to already-stored items: appends evidence (capped 10), pushes an
 * engagement-history snapshot reflecting the corroboration-augmented totals, and recomputes
 * `current_trend_score` via the shared scoring function. Never throws — a corroboration-write
 * failure must not affect the ingestion run's outcome.
 */
const applyStoredCorroborations = async (storedCorroborations: Map<string, CorroborationEvidence[]>): Promise<void> => {
  if (storedCorroborations.size === 0) return;
  try {
    const ids = [...storedCorroborations.keys()];
    const docs = await NewsItem.find(
      { _id: { $in: ids } },
      { engagement: 1, corroborations: 1, engagement_history: 1, published_at: 1, created_at: 1 },
    );
    const now = new Date();
    const ops = docs.map((doc) => {
      const fresh = storedCorroborations.get(doc._id.toString()) ?? [];
      // Dedupe by URL so a recurring cross-post (a perpetual hard-duplicate that is never stored,
      // and thus re-corroborates its match every run) refreshes its evidence instead of stacking
      // duplicates and inflating the augmented score unboundedly.
      const byUrl = new Map<string, CorroborationEvidence>();
      for (const ev of [...(doc.corroborations ?? []), ...fresh]) byUrl.set(ev.url, ev);
      const allCorroborations = [...byUrl.values()].slice(-10);
      const sum = (key: 'points' | 'comments') => allCorroborations.reduce((acc, c) => acc + c[key], 0);
      const augmentedEngagement = {
        points: doc.engagement.points + sum('points'),
        comments: doc.engagement.comments + sum('comments'),
        stars_delta: doc.engagement.stars_delta,
      };
      const snapshot = { at: now, ...augmentedEngagement };
      const history = [...(doc.engagement_history ?? []), snapshot].slice(-32);
      const current_trend_score = computeCurrentTrendScore(
        { engagement: augmentedEngagement, published_at: doc.published_at, created_at: doc.created_at, engagement_history: history },
        now,
      );
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { corroborations: allCorroborations, engagement_history: history, current_trend_score } },
        },
      };
    });
    if (ops.length > 0) await NewsItem.bulkWrite(ops, { ordered: false });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[NewsIngestion] failed to apply corroborations');
  }
};

/** Effective engagement = the item's own engagement plus every absorbed corroboration's counts. */
const augmentedEngagement = (item: { raw_points: number; raw_comments: number; raw_stars_delta: number; corroborations?: CorroborationEvidence[] }) => {
  const corro = item.corroborations ?? [];
  return {
    points: item.raw_points + corro.reduce((acc, c) => acc + c.points, 0),
    comments: item.raw_comments + corro.reduce((acc, c) => acc + c.comments, 0),
    stars_delta: item.raw_stars_delta,
  };
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
  let contentFetchedCounts: Record<string, number> | undefined;
  let contentFailedCounts: Record<string, number> | undefined;
  let adjudicationCounts: IAdjudicationCounts | undefined;
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

    // Layer 2b: Two-band Semantic Dedup + gray-band LLM adjudication (D2). Hard duplicates and
    // judged duplicates are dropped (their engagement absorbed as corroboration); material updates
    // and distinct stories survive. `deduped` is the final survivor set — `dedupedCounts` counts it
    // so the per-source `semantic_deduped = afterUnique - afterDeduped` invariant still holds.
    const embedded = await embedItems(unique);

    const dedupCutoff = new Date(Date.now() - config.news_ingestion.max_age_hours * 60 * 60 * 1000);
    const recentPool = await fetchRecentEmbeddings(dedupCutoff);
    const routing = dedupeSemantic(
      embedded,
      recentPool,
      config.news_ingestion.semantic_dedup_threshold,
      config.news_ingestion.hard_dup_threshold,
    );
    const adjudication = await applyAdjudication(routing, config.news_ingestion.adjudication_max_batches);
    adjudicationCounts = adjudication.counts;
    const deduped = adjudication.survivors;
    dedupedCounts = countBySource(deduped);
    await applyStoredCorroborations(adjudication.storedCorroborations);
    logger.info(
      `[NewsIngestion] two-band dedup: ${embedded.length} candidates -> ${deduped.length} survived ` +
        `(${routing.hardStoredDrops.length} hard-dup, ${adjudication.counts.gray_pairs} gray pairs: ` +
        `${adjudication.counts.verdict_duplicate} dup / ${adjudication.counts.verdict_update} update / ` +
        `${adjudication.counts.verdict_distinct} distinct, ${adjudication.counts.fallbacks} fallback, ` +
        `recent pool size ${recentPool.length})`,
    );

    // Layer 3: Relevance & Trend Scoring
    const brandVoicePool = await fetchBrandVoicePool();
    const scored: ScoredNewsItem[] = deduped.map((item) => ({
      ...item,
      relevance_score: scoreRelevance(item.embedding, brandVoicePool),
      trend_score: scoreTrend(item.raw_points, item.raw_comments, item.raw_stars_delta),
    }));

    // Every deduped, fresh item is stored regardless of relevance — see
    // flexible-news-taxonomy-and-relevance. `relevance_score` is still computed above and stored
    // below for ranking/opportunity-scoring purposes only, never as a storage gate. `relevant` is
    // kept as a name (rather than renaming every downstream reference) since it's now simply an
    // alias for `scored` — nothing is actually filtered out here anymore.
    const relevant = scored;
    relevantCounts = countBySource(relevant);

    // Layer 3b: Content Enrichment (link-only items still missing `content` after adapter-level
    // capture — see news-full-content-sources). Storage no longer gates on relevance (above), so
    // enrichment gets its own, separate, independently-tunable relevance floor — otherwise every
    // fetched item would trigger a full-content network fetch, multiplying outbound HTTP calls by
    // however much volume the old storage gate used to cut. Cold start (no brand-voice pool yet)
    // enriches everything, mirroring the old storage gate's cold-start behavior.
    const enrichmentCandidates =
      brandVoicePool.length === 0
        ? relevant
        : relevant.filter((item) => (item.relevance_score ?? 0) >= config.news_ingestion.content_fetch_min_relevance);
    const belowEnrichmentFloor = relevant.filter((item) => !enrichmentCandidates.includes(item));

    let enrichedRelevant: ScoredNewsItem[] = relevant;
    if (config.news_ingestion.content_fetch.enabled) {
      try {
        const enrichment = await enrichContent(enrichmentCandidates);
        enrichedRelevant = [...enrichment.items, ...belowEnrichmentFloor];
        contentFetchedCounts = {};
        contentFailedCounts = {};
        for (const [source, counts] of Object.entries(enrichment.countsBySource)) {
          contentFetchedCounts[source] = counts.fetched;
          contentFailedCounts[source] = counts.failed;
        }
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : err },
          '[NewsIngestion] content enrichment failed — proceeding with unenriched items',
        );
      }
    }

    // Layer 4: Categorize & Score Opportunity
    const categorized: CategorizedNewsItem[] = await categorizeBatch(enrichedRelevant);
    const finalized: ScoredCategorizedNewsItem[] = categorized.map((item) => ({
      ...item,
      opportunity_score: computeOpportunityScore(item.relevance_score, item.trend_score, item.audience_fit, config.news_ingestion),
      // Low category confidence OR an adjudication fallback/low-confidence keep both flag review.
      needs_review:
        item.category_confidence < config.news_ingestion.category_confidence_threshold ||
        item.needs_review_adjudication === true,
    }));

    const ingestedAt = new Date();
    const payloads = finalized.map((item) => ({
      source: item.source,
      source_id: item.source_id,
      content_hash: item.content_hash,
      title: item.title,
      url: item.url,
      // See design.md decision 6 of news-source-link-and-thumbnail-fields: this map is an explicit
      // field list, not a spread — a field only on RawNewsItem is silently dropped if not listed here.
      discussion_url: item.discussion_url,
      thumbnail_url: item.thumbnail_url,
      snippet: item.snippet,
      // A 'failed' marker means enrichment tried and found nothing — withContentMeta would
      // otherwise read the still-empty `content` as 'none' (never attempted), losing that signal.
      ...(item.content_status === 'failed'
        ? { content_status: 'failed' as const }
        : withContentMeta(item.content, config.news_ingestion.content_max_chars)),
      published_at: item.published_at,
      engagement: {
        points: item.raw_points,
        comments: item.raw_comments,
        stars_delta: item.raw_stars_delta,
      },
      // Absorbed duplicate evidence (D2) — provenance plus a score boost via augmented engagement.
      ...(item.corroborations && item.corroborations.length > 0 ? { corroborations: item.corroborations } : {}),
      trend_score: item.trend_score,
      // Corroboration-augmented so a multi-community story ingests already stronger, not duplicated.
      current_trend_score: computeCurrentTrendScore(
        {
          engagement: augmentedEngagement(item),
          published_at: item.published_at,
          created_at: ingestedAt,
        },
        ingestedAt,
      ),
      category: item.category,
      category_group: item.category_group,
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
      contentFetchedCounts,
      contentFailedCounts,
      errorsBySource,
      adjudication: adjudicationCounts,
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
      contentFetchedCounts,
      contentFailedCounts,
      errorsBySource,
      adjudication: adjudicationCounts,
      totalStored,
      topLevelError: message,
    });
    throw err;
  }
};
