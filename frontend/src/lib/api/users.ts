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

/** POST /users (super_admin-only). */
export function createUser(payload: CreateUserPayload): Promise<UserDto> {
  return apiPost<UserDto>('/users', payload);
}

/** GET /users (super_admin-only) — every account in the system, or `?team_id=` to scope to one team. */
export function listUsers(teamId?: string): Promise<UserDto[]> {
  return apiGet<UserDto[]>('/users', { params: teamId ? { team_id: teamId } : undefined });
}
