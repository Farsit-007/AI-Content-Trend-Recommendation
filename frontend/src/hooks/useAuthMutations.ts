import { useMutation } from '@tanstack/react-query';
import * as authApi from '@/lib/api/auth';
import { setToken } from '@/lib/api/tokenStore';
import { useAuth } from '@/context/auth-context';

/**
 * TanStack Query mutation hooks for the auth lifecycle. Components consume these
 * for consistent `isPending` / error handling. Login and logout delegate to
 * `AuthContext` (the source of truth for `user` + query-cache side effects); the
 * password mutations own their own token side effects.
 *
 * Errors surface as the normalized `ApiError` thrown by the api client, so forms
 * can read `mutation.error?.message` directly.
 */

/** POST /auth/login — establishes the cookie-first session and in-memory token. */
export function useLogin() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
  });
}

/** POST /auth/logout — clears the refresh cookie, in-memory token, and query cache. */
export function useLogout() {
  const { logout } = useAuth();
  return useMutation({
    mutationFn: () => logout(),
  });
}

/**
 * POST /auth/change-password — adopts the rotated access token from the response
 * so the session survives the change without a re-login.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: { old_password: string; new_password: string }) =>
      authApi.changePassword(payload),
    onSuccess: (data) => {
      setToken(data.token);
    },
  });
}

/** POST /auth/forgot-password — request a reset token (non-enumerating response). */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
  });
}

/** POST /auth/reset-password — set a new password using a single-use reset token. */
export function useResetPassword() {
  return useMutation({
    mutationFn: (payload: { token: string; new_password: string }) =>
      authApi.resetPassword(payload),
  });
}
