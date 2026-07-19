import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type { LanguageStyle } from './content';

export interface TeamVoiceProfile {
  default_language: LanguageStyle;
  custom_instructions?: string;
}

/** Team shape shared by the Generate editor (language default) and Team Settings (8C). */
export interface TeamDto {
  _id: string;
  name: string;
  description?: string;
  voice_profile?: TeamVoiceProfile;
  default_style_pack_id?: string;
  subscribed_categories: string[];
  custom_categories: string[];
}

export type TeamMemberRole = 'team_admin' | 'member';

export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  /** This user's global tier (`super_admin`/`user`) — distinct from `team_role` below. */
  role: string;
  /** This user's role on *this* team specifically — what makes them "the" team admin. */
  team_role: TeamMemberRole;
}

/** GET /teams — all teams for admin/super_admin, membership-scoped otherwise. */
export function listTeams(): Promise<TeamDto[]> {
  return apiGet<TeamDto[]>('/teams');
}

/** GET /teams/:id -> { team, members, team_ready } */
export function getTeam(id: string): Promise<{ team: TeamDto; members: TeamMember[]; team_ready: boolean }> {
  return apiGet<{ team: TeamDto; members: TeamMember[]; team_ready: boolean }>(`/teams/${id}`);
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
  voice_profile?: TeamVoiceProfile;
  subscribed_categories?: string[];
  default_style_pack_id?: string | null;
}

/** PATCH /teams/:id (admin-only server-side) */
export function updateTeam(id: string, payload: UpdateTeamPayload): Promise<TeamDto> {
  return apiPatch<TeamDto>(`/teams/${id}`, payload);
}

/** GET /teams/:id/categories -> fixed taxonomy + this team's custom categories */
export function getTeamCategories(id: string): Promise<string[]> {
  return apiGet<string[]>(`/teams/${id}/categories`);
}

export interface CreateTeamPayload {
  name: string;
  description?: string;
  member_ids?: string[];
  /** Must be one of `member_ids` — becomes this team's initial team_admin. */
  team_admin_id?: string;
}

/** POST /teams (super_admin-only) — `created_by` is stamped server-side from the caller. */
export function createTeam(payload: CreateTeamPayload): Promise<TeamDto> {
  return apiPost<TeamDto>('/teams', payload);
}

/** DELETE /teams/:id (super_admin-only) — cascades TeamMembership only; see the known-gaps note
 *  on orphaned BrandVoiceExample/GeneratedContent/ChatMessage/override rows. */
export function deleteTeam(id: string): Promise<TeamDto> {
  return apiDelete<TeamDto>(`/teams/${id}`);
}

/** POST /teams/:id/members (that team's team_admin, or super_admin) — 409 if already a member. */
export function addTeamMember(teamId: string, userId: string, role?: TeamMemberRole): Promise<unknown> {
  return apiPost<unknown>(`/teams/${teamId}/members`, { user_id: userId, role });
}

/** DELETE /teams/:id/members/:userId (that team's team_admin, or super_admin) — 404 if not a member. */
export function removeTeamMember(teamId: string, userId: string): Promise<unknown> {
  return apiDelete<unknown>(`/teams/${teamId}/members/${userId}`);
}

/** PATCH /teams/:id/members/:userId/role (that team's team_admin, or super_admin) — promotes/demotes
 *  a member; rejected with 400 if it would leave the team with zero team_admins. */
export function setTeamMemberRole(teamId: string, userId: string, role: TeamMemberRole): Promise<unknown> {
  return apiPatch<unknown>(`/teams/${teamId}/members/${userId}/role`, { role });
}

/** POST /teams/:id/categories — any team member; used to correct a global item's category (§1.4). */
export function addCustomCategory(teamId: string, category: string): Promise<TeamDto> {
  return apiPost<TeamDto>(`/teams/${teamId}/categories`, { category });
}

/** DELETE /teams/:id/categories/:category — any team member. */
export function removeCustomCategory(teamId: string, category: string): Promise<TeamDto> {
  return apiDelete<TeamDto>(`/teams/${teamId}/categories/${encodeURIComponent(category)}`);
}
