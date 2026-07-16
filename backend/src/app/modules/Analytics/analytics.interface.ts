export type AnalyticsStatus = 'ok' | 'not_connected' | 'pending_approval' | 'error';

export interface IAnalyticsOverview {
  reach: number;
  engagements: number;
  views: number;
  engagement_rate: number;
}

export interface ITopPost {
  post_id: string;
  content_snippet?: string;
  reach: number;
  engagement: number;
  format?: string;
  published_at?: Date;
}

export interface IBestTime {
  hour: number;
  day: number;
  avg_reach: number;
}

export interface IContentBreakdown {
  format: string;
  avg_engagement_rate: number;
}

export interface IAnalyticsRollup {
  team_id: string;
  platform: string;
  status: AnalyticsStatus;
  period: { start: Date; end: Date };
  overview: IAnalyticsOverview;
  top_posts: ITopPost[];
  best_times: IBestTime[];
  content_breakdown: IContentBreakdown[];
  // True when this rollup was produced by a mock adapter (demo data) rather than real Graph data.
  is_mock?: boolean;
  fetched_at: Date;
}

export interface IAdapterPost {
  post_id: string;
  content_snippet?: string;
  metrics: {
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  published_at?: Date;
  format?: string;
}

export interface IAdapterResult {
  status: AnalyticsStatus;
  posts: IAdapterPost[];
}

export interface IAnalyticsRefreshSummary {
  success: boolean;
  teamsProcessed: number;
  platformsProcessed: number;
}
