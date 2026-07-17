export interface INewsItem {
  source: string;
  source_id: string;
  content_hash: string;
  title: string;
  url: string;
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
  source_removed: boolean;
  lifecycle: 'active' | 'archived';
  archived_at?: Date;
  archive_reason?: 'max_age' | 'trend_floor' | 'source_removed';
}
