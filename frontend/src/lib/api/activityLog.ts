import { apiGetList } from './client';
import type { Meta } from './types';

export type ActivityAction =
  | 'content.generated'
  | 'content.refined'
  | 'content.draft_saved'
  | 'content.draft_approved'
  | 'content.draft_dismissed'
  | 'team.settings_updated'
  | 'team.member_added'
  | 'team.member_removed'
  | 'team.member_role_changed'
  | 'news.category_corrected';

export interface ActivityLogEntryDto {
  _id: string;
  team_id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  action: ActivityAction;
  summary: string;
  target_type?: 'generated_content' | 'team' | 'news_item';
  target_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface GetActivityLogParams {
  team_id: string;
  action?: ActivityAction;
  page?: number;
  limit?: number;
}

/** GET /activity-log — every logged action for a team, most recent first. */
export function getActivityLog(
  params: GetActivityLogParams,
): Promise<{ data: ActivityLogEntryDto[]; meta?: Meta }> {
  return apiGetList<ActivityLogEntryDto[]>('/activity-log', { params });
}
