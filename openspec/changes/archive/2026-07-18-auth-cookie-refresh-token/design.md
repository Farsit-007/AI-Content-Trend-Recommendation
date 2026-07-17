## Context

The backend already implements a cookie-first auth model: `POST /auth/login` sets an httpOnly `refresh_token` cookie (scoped to `/api/v1/auth`, `SameSite=Lax` in dev / `None`+`Secure` in prod) and also returns `token` (access), `refresh_token`, and `user` in the body. `refresh-token`, `change-password`, `logout`, `forgot-password`, and `reset-password` endpoints all exist, with token rotation and password-change invalidation (`password_changed_at`, backdated 1s). CORS is configured with `credentials: true` and an allow-list including `localhost:5173`.

The frontend has **most of the plumbing but the wrong storage choice**:
- `src/lib/api/tokenStore.ts` persists the access token in `localStorage`.
- `src/lib/api/client.ts` already has request/response interceptors with single-flight 401 refresh via a bare axios call, and `withCredentials: true`.
- `src/context/AuthContext.tsx` boots by reading `localStorage` and calling `/auth/me`.
- `src/lib/api/auth.ts` has `login`, `getMe`, `refreshToken`, `logout` — but **no** change/forgot/reset.
- There are no forgot/reset/change-password pages, and auth actions bypass TanStack Query (which is installed and wired via `queryClient`).

This change swaps the storage strategy to in-memory + cookie, adds the missing password flows, and routes all auth actions through TanStack Query mutations. It is almost entirely a frontend change.

## Goals / Non-Goals

**Goals:**
- Access token lives in memory only; the httpOnly refresh cookie is the sole persisted credential.
- Full-reload sessions survive via silent `/auth/refresh-token` rehydration on boot.
- Expired access tokens are renewed transparently by the axios interceptor, single-flighted.
- Change password, forgot password, and reset password are usable from the UI.
- All auth actions are consumed through TanStack Query mutations for consistent loading/error handling and cache invalidation.

**Non-Goals:**
- Moving the **access** token into an httpOnly cookie (kept in memory; would require CSRF handling and a backend change).
- Refresh-token reuse detection / server-side session store / device management.
- Real email delivery for password reset (no SMTP configured — token is logged/returned in dev, unchanged).
- Self-registration UI (registration is admin-only and out of scope).

## Decisions

### 1. In-memory token holder instead of localStorage
`tokenStore.ts` becomes a module-level variable with `getToken`/`setToken`/`clearToken` and an optional `subscribe` for React re-renders. Rationale: an in-memory token cannot be exfiltrated by XSS-persisted reads across sessions and disappears on tab close; the httpOnly refresh cookie (not JS-readable) carries persistence. **Alternative considered:** access token in an httpOnly cookie — rejected for this change because it forces CSRF protection and a backend cookie-issuing change; deferred as a Non-Goal. The `tokenStore` interface stays identical to today so `client.ts` needs no signature changes.

### 2. Boot rehydration via refresh, not via stored token
`AuthProvider` no longer checks `localStorage`. On mount it calls `authApi.refreshToken()` (cookie-based); on success it sets the in-memory token and calls `getMe()`; on failure it renders unauthenticated. Rationale: with no persisted access token, the refresh cookie is the only way to know if a session exists. **Alternative considered:** call `/auth/me` first and refresh on its 401 — rejected because it doubles boot latency and duplicates the interceptor's job; an explicit refresh is clearer and single-purpose.

### 3. Keep the existing single-flight interceptor; align it with in-memory storage
The response interceptor in `client.ts` already refreshes once on 401, retries, and single-flights via a module `refreshPromise` using a bare axios call (so it doesn't re-enter the interceptor). We keep this design and ensure `refreshAccessToken()` writes to the in-memory `setToken`. Rationale: it already meets the spec; changing storage doesn't change control flow. Auth calls (`/auth/login`, `/auth/refresh-token`) remain excluded from refresh-retry to avoid loops.

### 4. TanStack Query mutation layer
Add hooks (e.g. `src/hooks/useAuthMutations.ts`): `useLogin`, `useLogout`, `useChangePassword`, `useForgotPassword`, `useResetPassword`. Each wraps the corresponding `auth.ts` call in `useMutation`, surfaces `isPending`/`error`, and invalidates/`clear()`s the query cache where appropriate (logout clears cache; login/refresh may invalidate `['me']`). The `AuthContext` remains the source of truth for `user`/`isAuthenticated` and delegates the network calls to these mutations (or shares the same `auth.ts` functions). Rationale: consistent, cancelable, dedupe-friendly data layer; matches how the rest of the app fetches (`queryClient` already exists). **Alternative considered:** keep calling `auth.ts` directly from `AuthContext` — rejected because the request explicitly asks for TanStack Query and it standardizes error/loading UX.

### 5. New routes
Public: `/forgot-password`, `/reset-password` (reads token from query param or a field). Authenticated: a Change Password form on an account/settings surface (or a dedicated `/dashboard/account`). Register them in `src/routes/routes.tsx`, reusing the existing shadcn `Form`/`Input`/`Card` components and `react-hook-form` + `zod` as `Login.tsx` does.

### 6. Backend: verify, don't rebuild
Confirm cookie attributes and CORS behave across login → refresh → change-password → logout; ensure `withCredentials` requests carry the cookie on the `/api/v1/auth` path. No new endpoints are anticipated. The body still returns `refresh_token` for non-browser clients; browsers ignore it and rely on the cookie.

## Risks / Trade-offs

- **In-memory token lost on reload adds a boot refresh round-trip** → Mitigation: single `POST /auth/refresh-token` on boot; show a lightweight loading state; public routes render without waiting on auth.
- **Refresh-cookie path scope (`/api/v1/auth`) mismatch** → the cookie is only sent to `/api/v1/auth/*`; refresh/login/logout all live there, so this is fine — but any future auth endpoint outside that path won't receive it. Mitigation: keep auth endpoints under `/auth`.
- **Cross-site cookies in production need `SameSite=None; Secure` and exact CORS origin** → Mitigation: backend already switches to `None`+`Secure` in prod; verify `VITE_API_URL` and `web_url`/CORS origin match the deployed frontend origin (no trailing slash).
- **Interceptor loop if `/auth/me` 401s during boot** → Mitigation: boot calls refresh explicitly first; `/auth/refresh-token` is excluded from retry; a failed boot refresh simply yields the unauthenticated state.
- **Two sources of truth (AuthContext state vs. Query cache)** → Mitigation: AuthContext owns `user`; mutations delegate network + cache side-effects; avoid caching the user in both places inconsistently (invalidate/refetch `['me']` on auth transitions).

## Migration Plan

1. Convert `tokenStore.ts` to in-memory (interface unchanged).
2. Update `AuthContext` boot to refresh-then-`getMe`; update `login`/`logout` to in-memory + cache clear.
3. Confirm `client.ts` interceptor writes to in-memory token (no control-flow change).
4. Add `changePassword`/`forgotPassword`/`resetPassword` to `auth.ts` and the `useAuthMutations` hooks.
5. Add Forgot/Reset pages and the Change Password form; register routes.
6. Verify end-to-end: login, reload (rehydrate), expire access token → transparent refresh, change password (session survives), forgot→reset, logout.
7. **Rollback:** revert `tokenStore.ts` to the localStorage version; the new pages/hooks are additive and inert if unused.

## Open Questions

- Where should Change Password live — a new `/dashboard/account` page or an existing settings surface? (Default: new account page; low risk to move.)
- Does the deployed production frontend share the API's site for cookies, or is cross-site (`SameSite=None`) required? Confirm before prod cutover.
