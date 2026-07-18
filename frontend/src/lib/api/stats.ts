import { apiGet } from './client';

export interface TeamOverviewStats {
  team_id: string;
  team_name: string;
  members_count: number;
  drafts: { draft: number; approved: number; dismissed: number; total: number };
  brand_voice_examples_count: number;
  is_cold_start: boolean;
  subscribed_categories: string[];
  high_opportunity_items_count: number;
  recent_drafts: { _id: string; topic: string; status: string; source: string; created_at: string }[];
}

export interface SystemOverviewStats {
  total_news_items: number;
  news_items_last_24h: number;
  total_teams: number;
  total_users: number;
  users_by_role: { user: number; admin: number; super_admin: number };
  total_drafts: number;
  drafts_by_status: { draft: number; approved: number; dismissed: number };
  total_style_packs: number;
  active_style_packs: number;
  last_ingestion_run: { started_at: string; total_stored: number; trigger: 'cron' | 'manual' } | null;
  alerting_sources_count: number;
}

export interface OverviewStats {
  team: TeamOverviewStats | null;
  system: SystemOverviewStats | null;
}

/** GET /stats/overview — team-scoped stats for every role; `system` is populated only for
 *  admin/super_admin callers (null otherwise). */
export function getOverviewStats(teamId?: string): Promise<OverviewStats> {
  return apiGet<OverviewStats>('/stats/overview', { params: teamId ? { team_id: teamId } : undefined });
}
