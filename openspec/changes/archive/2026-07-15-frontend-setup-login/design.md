## Context

The `frontend/` app is a blank Vite + React 19 scaffold. The backend is complete on port 5000 with a standard success/error envelope (`{ success, message, meta, data }` / `{ success, message, errorSource[] }`) and an auth flow that returns a Bearer access token in the login response body plus an httpOnly refresh cookie (`POST /auth/refresh-token`). Backend CORS already allows `http://localhost:5173` with `credentials: true`. This change builds the foundation and the login flow only; feature pages and other API modules are deliberately out of scope.

## Goals / Non-Goals

**Goals:**
- Stand up styling (Tailwind v4), UI kit (shadcn/ui), routing (React Router v7), and server-state (TanStack Query) foundations.
- One shared axios client that centralizes base URL, credentials, auth header, envelope unwrapping, error normalization, and 401 refresh.
- Working login: form → real backend → session established → protected redirect, with boot-time hydration and logout.
- Isolate the token source so the backend's future move to cookie-based auth is a one-file change.

**Non-Goals:**
- No dashboard or feature pages beyond a minimal authenticated placeholder.
- No API modules other than auth (`login`, `me`, `refreshToken`, `logout`).
- No theme-toggle UI (dark is simply the default); no i18n; no test suite in this change.

## Decisions

- **TanStack Query + axios over RTK Query/Redux.** The app is server-state-heavy and client-state-light; a query cache plus small React Contexts avoids Redux boilerplate. Only auth is wired now, but the provider is in place for later features. *Alternative:* RTK Query — rejected because it drags in a Redux store this app otherwise doesn't need.
- **`tokenStore` abstraction (localStorage today).** All token reads/writes go through `getToken/setToken/clearToken`. The request interceptor and `AuthContext` never touch storage directly, so switching to httpOnly-cookie access tokens later means editing one module (and dropping the Bearer header). *Alternative:* in-memory + silent refresh — more secure but more wiring; deferred for hackathon speed. `withCredentials: true` is enabled now so the cookie path already works.
- **Interceptor-owned 401 refresh with single-flight.** A shared refresh promise coalesces concurrent 401s into one `POST /auth/refresh-token`; the original requests retry once after it resolves. On refresh failure the client clears the session and redirects to `/login`. Centralizing this in the client keeps feature code unaware of token lifecycle. *Alternative:* per-call handling — rejected as error-prone and duplicative.
- **AuthContext for client session; envelope unwrapping in the client layer.** Pages consume a stable `{ user, isAuthenticated, login, logout, isLoading }` API; the axios layer unwraps `data`/`meta` so components deal in domain types, not envelopes.
- **react-hook-form + zod for the login form.** Matches the backend's zod validation style and gives typed, low-rerender forms with shadcn `form` components.

## Risks / Trade-offs

- **localStorage token is XSS-exposed** → Accepted for hackathon; mitigated by the `tokenStore` seam that makes migrating to httpOnly-cookie access tokens cheap.
- **Refresh/redirect loop if `/auth/refresh-token` returns 401** → Mitigation: the refresh call itself bypasses the retry interceptor and, on failure, clears the session and hard-redirects once to `/login` rather than retrying.
- **shadcn/ui + Tailwind v4 + React 19 tooling churn** → Mitigation: use the current shadcn CLI (Tailwind v4 support) and pin versions; verify with `npm run build`.
- **Boot `GET /auth/me` adds a first-load request** → Acceptable; it also validates the stored token and prevents rendering as authenticated with a stale token.

## Migration Plan

- Additive only; no backend changes and no existing frontend code to migrate (scaffold is replaced). Rollback = revert the frontend commit.
- Future auth change (token → cookie): update `tokenStore` (return nothing / rely on cookie) and stop attaching the Bearer header; `AuthContext.login()`/boot hydration switch to relying on the cookie + `GET /auth/me`. No feature code changes.
