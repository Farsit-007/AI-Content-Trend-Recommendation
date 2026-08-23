/**
 * One entry per human-initiated action worth showing a team "who did what, when" — content
 * generation/refinement, draft lifecycle changes, and team settings/roster changes. Never the
 * record of truth for the action itself (that's GeneratedContent/Team/etc.) — purely an
 * append-only, denormalized trail for display. `actor_name`/`actor_email` are denormalized at
 * write time so the activity feed never needs a join back to Users, and still reads correctly
 * even if the actor's account is later renamed or removed.
 */
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
  | 'news.category_corrected'
  | 'llm.key_revealed'
  // Platform-scoped, like llm.key_revealed — recorded under PLATFORM_SCOPE, not a real team.
  | 'user.updated'
  | 'user.deleted';

/**
 * Sentinel `team_id` for platform-scoped actions that belong to no team (`llm.key_revealed` and
 * the `user.*` account-management actions). Keeps the trail in one queryable collection without leaking a super-admin
 * action into any real team's activity feed, since every read path filters by a concrete team id.
 */
export const PLATFORM_SCOPE = '__platform__';

export interface IActivityLogEntry {
  team_id: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  action: ActivityAction;
  /** Human-readable one-liner for the feed, e.g. `Generated facebook_post for "AI agents"`. */
  summary: string;
  target_type?: 'generated_content' | 'team' | 'news_item' | 'llm_provider_key' | 'user';
  target_id?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}
