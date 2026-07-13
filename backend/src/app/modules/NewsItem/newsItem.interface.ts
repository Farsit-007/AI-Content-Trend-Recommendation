export interface INewsItem {
  source: string;
  source_id: string;
  content_hash: string;
  title: string;
  url: string;
  snippet?: string;
  published_at?: Date;
  engagement: {
    points: number;
    comments: number;
    stars_delta: number;
  };
  trend_score: number;
  category?: string;
  relevance_score?: number;
  impact_note?: string;
  embedding: number[];
  opportunity_score?: number;
  processed: boolean;
  created_at: Date;
}
