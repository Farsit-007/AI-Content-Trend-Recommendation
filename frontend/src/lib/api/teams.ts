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

export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  role: string;
}

/** GET /teams — all teams for admin/super_admin, membership-scoped otherwise. */
export function listTeams(): Promise<TeamDto[]> {
  return apiGet<TeamDto[]>('/teams');
}

/** GET /teams/:id -> { team, members } */
export function getTeam(id: string): Promise<{ team: TeamDto; members: TeamMember[] }> {
  return apiGet<{ team: TeamDto; members: TeamMember[] }>(`/teams/${id}`);
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
}

/** POST /teams (admin-only) — `created_by` is stamped server-side from the caller. */
export function createTeam(payload: CreateTeamPayload): Promise<TeamDto> {
  return apiPost<TeamDto>('/teams', payload);
}

/** DELETE /teams/:id (admin-only) — cascades TeamMembership only; see the known-gaps note
 *  on orphaned BrandVoiceExample/GeneratedContent/ChatMessage/override rows. */
export function deleteTeam(id: string): Promise<TeamDto> {
  return apiDelete<TeamDto>(`/teams/${id}`);
}

/** POST /teams/:id/members (admin-only) — 409 if already a member. */
export function addTeamMember(teamId: string, userId: string): Promise<unknown> {
  return apiPost<unknown>(`/teams/${teamId}/members`, { user_id: userId });
}

/** DELETE /teams/:id/members/:userId (admin-only) — 404 if not a member. */
export function removeTeamMember(teamId: string, userId: string): Promise<unknown> {
  return apiDelete<unknown>(`/teams/${teamId}/members/${userId}`);
}

/** POST /teams/:id/categories — any team member; used to correct a global item's category (§1.4). */
export function addCustomCategory(teamId: string, category: string): Promise<TeamDto> {
  return apiPost<TeamDto>(`/teams/${teamId}/categories`, { category });
}

/** DELETE /teams/:id/categories/:category — any team member. */
export function removeCustomCategory(teamId: string, category: string): Promise<TeamDto> {
  return apiDelete<TeamDto>(`/teams/${teamId}/categories/${encodeURIComponent(category)}`);
}
