import { apiGet, apiPost } from './client';
import type { AuthUser } from './types';

export interface UserDto {
  _id: string;
  email: string;
  name: string;
  role: AuthUser['role'];
  created_at: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  role?: AuthUser['role'];
  team_ids?: string[];
}

/** POST /users (admin-only; `role: 'super_admin'` is itself super_admin-only server-side). */
export function createUser(payload: CreateUserPayload): Promise<UserDto> {
  return apiPost<UserDto>('/users', payload);
}

/** GET /users (admin-only) — every account in the system, or `?team_id=` to scope to one team. */
export function listUsers(teamId?: string): Promise<UserDto[]> {
  return apiGet<UserDto[]>('/users', { params: teamId ? { team_id: teamId } : undefined });
}
