export interface RawNewsItem {
  source: string;
  source_id: string;
  title: string;
  url: string;
  /** The aggregator's own comment/discussion thread, when distinct from `url` (e.g. HN item page, Reddit permalink, Product Hunt post page). */
  discussion_url?: string;
  /** A source-native preview image (cover image, social image, thumbnail field) — never scraped/derived. */
  thumbnail_url?: string;
  snippet?: string;
  content?: string;
  /** Set to 'failed' by content enrichment when a fetch/extraction attempt found nothing usable — distinct from simply never having been attempted. */
  content_status?: 'failed';
  published_at?: Date;
  raw_points: number;
  raw_comments: number;
  raw_stars_delta: number;
}

export const NEWS_CATEGORIES = ['AI', 'Web Dev', 'Career', 'Security', 'DevOps', 'Other'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface ScoredNewsItem extends RawNewsItem {
  content_hash: string;
  embedding: number[];
  relevance_score?: number;
  trend_score: number;
  /** In-run-absorbed duplicate engagement carried through to the stored payload (D2). */
  corroborations?: { source: string; points: number; comments: number; url: string; at: Date }[];
  /** Set when adjudication kept the item via a low-confidence or fallback verdict (D2). */
  needs_review_adjudication?: boolean;
}

export interface CategorizedNewsItem extends ScoredNewsItem {
  /** Free-form — any name in the global category taxonomy (fixed six or discovered), not just
   *  `NewsCategory`. See flexible-news-taxonomy-and-relevance. */
  category: string;
  /** The one of the fixed six (`NewsCategory`) `category` rolls up under. */
  category_group: NewsCategory;
  impact_note: string;
  category_confidence: number;
  audience_fit: number;
}

export interface ScoredCategorizedNewsItem extends CategorizedNewsItem {
  opportunity_score: number;
  needs_review: boolean;
}

export interface AdapterResult {
  source: string;
  items: RawNewsItem[];
  error?: string;
}

export interface SourceSummary {
  source: string;
  fetched: number;
  deduped: number;
  discarded: number;
  stored: number;
}

export interface IngestionSummary {
  sources: SourceSummary[];
  totalStored: number;
}
