## Why

The frontend still persists the access token in `localStorage`, which is readable by any injected script (XSS) and lingers after the tab closes. The backend already issues an httpOnly refresh cookie and exposes refresh/change/forgot/reset endpoints, but the frontend never adopted the cookie-based session model, has no UI for changing or recovering a password, and drives auth through ad-hoc context calls instead of a consistent data-fetching layer. We want a secure, cookie-first session where the access token lives only in memory and is silently renewed from the refresh cookie whenever it expires.

## What Changes

- **BREAKING (frontend storage):** Stop persisting the access token in `localStorage`. The access token is held **in memory only**; the httpOnly refresh cookie (already set by the backend on login) is the sole persisted credential.
- On app boot / full page reload, silently rehydrate the session by calling `POST /auth/refresh-token` (the browser sends the refresh cookie automatically) to mint a fresh in-memory access token, then load the current user.
- The axios response interceptor renews the access token from the refresh cookie on a `401`, retries the original request once, and single-flights concurrent refreshes (already present — confirm and align with in-memory storage and the boot flow).
- Add **TanStack Query** mutations for all auth actions — login, logout, change password, forgot password, reset password, refresh — so components consume a single, consistent hook layer instead of calling the context/api directly.
- Add **Change Password** UI (authenticated) wired to `POST /auth/change-password`, consuming the rotated token pair returned so the session survives the change.
- Add **Forgot Password** and **Reset Password** pages/routes wired to `POST /auth/forgot-password` and `POST /auth/reset-password`.
- Confirm/adjust the backend so browser flows rely on the cookie: keep returning the refresh token in the body only for non-browser clients, and ensure CORS `credentials` + cookie attributes work across login, refresh, change-password, and logout.

## Capabilities

### New Capabilities
- `authentication`: Cookie-first session lifecycle for the SPA — in-memory access token, httpOnly refresh-cookie rotation, silent boot rehydration, transparent 401 refresh-and-retry via the axios interceptor, and the full password lifecycle (login, logout, change password, forgot password, reset password) surfaced through TanStack Query mutations.

### Modified Capabilities
<!-- No existing main specs; nothing to modify. -->

## Impact

- **Frontend**
  - `src/lib/api/tokenStore.ts` — switch from `localStorage` to an in-memory holder (get/set/clear/subscribe).
  - `src/lib/api/client.ts` — align request/response interceptors with in-memory token; keep single-flight refresh.
  - `src/lib/api/auth.ts` — add `changePassword`, `forgotPassword`, `resetPassword` calls.
  - `src/context/AuthContext.tsx` — boot hydration via `/auth/refresh-token` (cookie) instead of reading `localStorage`.
  - New TanStack Query hooks (e.g. `src/lib/api/useAuthMutations.ts` or `src/hooks/`).
  - New pages/routes: `ForgotPassword`, `ResetPassword`, and a Change Password form (account/settings).
  - `src/routes/routes.tsx` — register the new public/authenticated routes.
- **Backend** (largely complete): verify cookie attributes, CORS `credentials`, and that `refresh-token`/`change-password`/`logout` set/clear the cookie correctly. No new endpoints expected.
- **Security posture:** removes the XSS-exfiltratable persisted token; session persistence now depends only on the httpOnly, SameSite refresh cookie.
- **Dependencies:** no new packages — `@tanstack/react-query`, `axios`, `react-hook-form`, and `zod` are already installed.
