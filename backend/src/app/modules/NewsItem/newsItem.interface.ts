export interface INewsItem {
  source: string;
  source_id: string;
  content_hash: string;
  title: string;
  url: string;
  /** The aggregator's own comment/discussion thread, when distinct from `url`. */
  discussion_url?: string;
  /** A source-native preview image when available, else an og:image scrape, else a static
   *  per-source logo — see newsIngestion.metaEnrichment. */
  thumbnail_url?: string;
  /** The source's own description/tagline, or an og:description scrape when the source has none.
   *  Distinct from `snippet` (a short teaser, sometimes just tags) and `content` (the relevance-gated
   *  full article text) — this is always populated when any description-like text is available. */
  description?: string;
  snippet?: string;
  content?: string;
  content_status: 'none' | 'partial' | 'full' | 'failed';
  content_fetched_at?: Date;
  word_count?: number;
  published_at?: Date;
  engagement: {
    points: number;
    comments: number;
    stars_delta: number;
  };
  trend_score: number;
  current_trend_score?: number;
  category?: string;
  /** Broad-group parent (one of the fixed six) `category` rolls up under — see
   *  flexible-news-taxonomy-and-relevance. */
  category_group?: string;
  relevance_score?: number;
  impact_note?: string;
  embedding: number[];
  opportunity_score?: number;
  category_confidence?: number;
  needs_review: boolean;
  processed: boolean;
  created_at: Date;
  engagement_history?: { at: Date; points: number; comments: number; stars_delta: number }[];
  engagement_refreshed_at?: Date;
  /** Engagement evidence from duplicates dropped in favor of this item (D2), capped at 10. */
  corroborations?: { source: string; points: number; comments: number; url: string; at: Date }[];
  source_removed: boolean;
  lifecycle: 'active' | 'archived';
  archived_at?: Date;
  archive_reason?: 'max_age' | 'trend_floor' | 'source_removed';
}
