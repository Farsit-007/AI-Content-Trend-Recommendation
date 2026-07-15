/**
 * The single source of truth for where the access token lives.
 *
 * Today the backend returns the access token in the login response body and we
 * persist it in localStorage. When the backend moves to an httpOnly cookie for
 * the access token, this is the ONLY module that changes: `getToken()` returns
 * null (the cookie is sent automatically via `withCredentials`) and set/clear
 * become no-ops. No other code reads or writes the token directly.
 */
const TOKEN_KEY = 'gs_access_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable (private mode / SSR) — ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
