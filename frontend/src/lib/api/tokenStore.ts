/**
 * The single source of truth for the access token.
 *
 * The access token is held **in memory only** — never in `localStorage` or
 * `sessionStorage`, so it can't be exfiltrated by an XSS-persisted read and it
 * disappears when the tab closes. Session persistence is carried entirely by the
 * backend's httpOnly `refresh_token` cookie: on boot / full reload the app calls
 * `POST /auth/refresh-token` (the cookie rides along automatically) to mint a
 * fresh in-memory access token. This is the ONLY module that reads or writes the
 * token directly.
 */
let accessToken: string | null = null;

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(accessToken);
}

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string): void {
  accessToken = token;
  emit();
}

export function clearToken(): void {
  accessToken = null;
  emit();
}

/** Subscribe to in-memory token changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
