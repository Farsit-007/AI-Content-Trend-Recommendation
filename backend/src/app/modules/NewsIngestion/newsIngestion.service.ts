import config from '../../config';
import { embed } from '../../lib/embeddings';
import { NewsItem } from '../NewsItem/newsItem.model';
import { runAllAdapters } from './adapters';
import { categorizeBatch } from './newsIngestion.categorize';
import { CategorizedNewsItem, IngestionSummary, ScoredNewsItem, SourceSummary } from './newsIngestion.interface';
import { fetchBrandVoicePool, scoreRelevance, scoreTrend } from './newsIngestion.scoring';
import { HashedNewsItem, attachContentHash, dedupeAgainstStored, filterFresh } from './newsIngestion.utils';

const countBySource = (items: { source: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.source] = (counts[item.source] ?? 0) + 1;
  }
  return counts;
};

export const runIngestionPipeline = async (): Promise<IngestionSummary> => {
  // Layer 1: Fetch & Normalize
  const adapterResults = await runAllAdapters();
  const sources = adapterResults.map((r) => r.source);
  const fetchedCounts = countBySource(adapterResults.flatMap((r) => r.items));

  // Layer 2: Dedupe & Freshness
  const hashed: HashedNewsItem[] = attachContentHash(adapterResults.flatMap((r) => r.items));
  const fresh = filterFresh(hashed, config.news_ingestion.max_age_hours);
  const freshCounts = countBySource(fresh);

  const unique = await dedupeAgainstStored(fresh);
  const uniqueCounts = countBySource(unique);

  // Layer 3: Relevance & Trend Scoring
  const brandVoicePool = await fetchBrandVoicePool();
  const scored: ScoredNewsItem[] = await Promise.all(
    unique.map(async (item) => {
      const embedding = await embed(`${item.title} ${item.snippet ?? ''}`.trim());
      return {
        ...item,
        embedding,
        relevance_score: scoreRelevance(embedding, brandVoicePool),
        trend_score: scoreTrend(item.raw_points, item.raw_comments, item.raw_stars_delta),
      };
    }),
  );

  // Cold start: skip relevance filtering entirely when no brand voice examples exist yet.
  const relevant =
    brandVoicePool.length === 0
      ? scored
      : scored.filter((item) => (item.relevance_score ?? 0) >= config.news_ingestion.min_relevance);
  const relevantCounts = countBySource(relevant);

  // Layer 4: Categorize & Score Opportunity
  const categorized: CategorizedNewsItem[] = await categorizeBatch(relevant);

  const payloads = categorized.map((item) => ({
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
    processed: true,
  }));

  let totalStored = 0;
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
      console.error('[NewsIngestion] insertMany reported errors:', err instanceof Error ? err.message : err);
    }
  }

  // Per-source "stored" reflects items attempted for storage post-scoring, not the verified
  // per-source insert outcome — acceptable since insert failures are rare races, not the norm.
  const summaries: SourceSummary[] = sources.map((source) => ({
    source,
    fetched: fetchedCounts[source] ?? 0,
    deduped: (freshCounts[source] ?? 0) - (uniqueCounts[source] ?? 0),
    discarded:
      (fetchedCounts[source] ?? 0) - (freshCounts[source] ?? 0) + ((uniqueCounts[source] ?? 0) - (relevantCounts[source] ?? 0)),
    stored: relevantCounts[source] ?? 0,
  }));

  return { sources: summaries, totalStored };
};
