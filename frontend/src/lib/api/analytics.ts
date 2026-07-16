import { apiGet } from './client';

export type AnalyticsStatus = 'ok' | 'not_connected' | 'pending_approval' | 'error';

export interface AnalyticsOverview {
  reach: number;
  engagements: number;
  views: number;
  engagement_rate: number;
}

export interface TopPost {
  post_id: string;
  content_snippet?: string;
  reach: number;
  engagement: number;
  format?: string;
  published_at?: string;
}

export interface BestTime {
  hour: number;
  day: number;
  avg_reach: number;
}

export interface ContentBreakdown {
  format: string;
  avg_engagement_rate: number;
}

/** One platform's analytics rollup — mirrors the backend `IAnalyticsRollup`. */
export interface AnalyticsRollup {
  team_id: string;
  platform: string;
  status: AnalyticsStatus;
  period: { start: string; end: string };
  overview: AnalyticsOverview;
  top_posts: TopPost[];
  best_times: BestTime[];
  content_breakdown: ContentBreakdown[];
  is_mock?: boolean;
  fetched_at: string;
}

/** LLM narrative report (from /reports). */
export interface TeamReport {
  team_id: string;
  ai_insight?: string;
  generated_at?: string;
}

/** All per-platform rollups for a team. */
export const getAnalytics = (teamId: string): Promise<AnalyticsRollup[]> =>
  apiGet<AnalyticsRollup[]>('/analytics', { params: { team_id: teamId } });

/** The team's LLM narrative report. */
export const getReport = (teamId: string): Promise<TeamReport> =>
  apiGet<TeamReport>('/reports', { params: { team_id: teamId } });
