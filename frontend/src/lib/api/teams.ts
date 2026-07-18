import { apiGet, apiPatch } from './client';
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
