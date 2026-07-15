import { apiGet, apiPost } from './client';
import type { AuthTokens, AuthUser } from './types';

/** POST /auth/login — returns the access token, refresh token, and user. */
export function login(email: string, password: string): Promise<AuthTokens> {
  return apiPost<AuthTokens>('/auth/login', { email, password });
}

/**
 * GET /auth/me — the current authenticated user (used for boot hydration).
 * Note: this endpoint nests the user under `data.user` alongside `team_ids`,
 * unlike /auth/login which returns the user at `data.user` within its own payload.
 */
export async function getMe(): Promise<AuthUser> {
  const data = await apiGet<{ user: AuthUser; team_ids: string[] }>('/auth/me');
  return { ...data.user, team_ids: data.team_ids };
}

/** POST /auth/refresh-token — rotate tokens using the httpOnly refresh cookie. */
export function refreshToken(): Promise<AuthTokens> {
  return apiPost<AuthTokens>('/auth/refresh-token', {});
}

/** POST /auth/logout — clears the refresh cookie server-side. */
export function logout(): Promise<null> {
  return apiPost<null>('/auth/logout', {});
}
