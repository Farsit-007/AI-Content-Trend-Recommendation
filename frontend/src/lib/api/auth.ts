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

/**
 * POST /auth/change-password — for the authenticated user. The backend
 * invalidates prior tokens and returns a rotated pair (and sets a fresh refresh
 * cookie); the caller adopts the new access `token` so the session survives.
 */
export function changePassword(payload: {
  old_password: string;
  new_password: string;
}): Promise<{ token: string; refresh_token?: string }> {
  return apiPost<{ token: string; refresh_token?: string }>(
    '/auth/change-password',
    payload,
  );
}

/**
 * POST /auth/forgot-password — always resolves with the same non-enumerating
 * message regardless of whether the email has an account. Outside production the
 * backend may include a `reset_token` in the body for development; in production
 * `data` is `null`.
 */
export function forgotPassword(
  email: string,
): Promise<{ reset_token?: string } | null> {
  return apiPost<{ reset_token?: string } | null>('/auth/forgot-password', {
    email,
  });
}

/** POST /auth/reset-password — set a new password using a single-use reset token. */
export function resetPassword(payload: {
  token: string;
  new_password: string;
}): Promise<null> {
  return apiPost<null>('/auth/reset-password', payload);
}
