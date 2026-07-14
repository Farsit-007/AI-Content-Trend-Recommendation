export interface RawNewsItem {
  source: string;
  source_id: string;
  title: string;
  url: string;
  snippet?: string;
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
}

export interface CategorizedNewsItem extends ScoredNewsItem {
  category: NewsCategory;
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
