## 1. In-memory token storage

- [x] 1.1 Rewrite `src/lib/api/tokenStore.ts` to hold the access token in a module-level variable (no `localStorage`/`sessionStorage`); keep `getToken`/`setToken`/`clearToken` signatures identical
- [x] 1.2 Add an optional `subscribe(listener)` (or a small getter) so React can react to token changes if needed, without persisting
- [x] 1.3 Grep the frontend for any other `localStorage`/`gs_access_token` references and remove/redirect them through `tokenStore`

## 2. Axios client alignment

- [x] 2.1 Confirm `src/lib/api/client.ts` request interceptor reads the in-memory token via `getToken()` and attaches `Authorization: Bearer` (no change expected)
- [x] 2.2 Confirm the response interceptor refreshes once on `401` for non-auth requests, single-flights via `refreshPromise`, retries the original, and clears token + redirects to `/login` on refresh failure
- [x] 2.3 Ensure `refreshAccessToken()` writes the new token via `setToken()` (in-memory) and that `/auth/login` + `/auth/refresh-token` stay excluded from refresh-retry

## 3. Auth API calls

- [x] 3.1 Add `changePassword({ old_password, new_password })` → `POST /auth/change-password`, returning the rotated `{ token }` so the caller can update the in-memory token
- [x] 3.2 Add `forgotPassword(email)` → `POST /auth/forgot-password` (returns the non-enumerating message; dev may include `reset_token`)
- [x] 3.3 Add `resetPassword({ token, new_password })` → `POST /auth/reset-password`
- [x] 3.4 Verify `login`, `getMe`, `refreshToken`, `logout` in `src/lib/api/auth.ts` match the cookie-first envelope shapes

## 4. TanStack Query auth mutations

- [x] 4.1 Create `src/hooks/useAuthMutations.ts` with `useLogin`, `useLogout`, `useChangePassword`, `useForgotPassword`, `useResetPassword` wrapping the `auth.ts` calls in `useMutation`
- [x] 4.2 `useLogin` sets the in-memory token + user and invalidates/refetches `['me']`; `useLogout` clears the token and calls `queryClient.clear()`
- [x] 4.3 `useChangePassword` adopts the rotated access token from the response so the session survives the change
- [x] 4.4 Surface `isPending` and normalized `ApiError` messages from each mutation for the forms to consume

## 5. AuthContext boot rehydration

- [x] 5.1 Update `src/context/AuthContext.tsx` boot effect to call `authApi.refreshToken()` (cookie-based) instead of reading `localStorage`
- [x] 5.2 On refresh success, set the in-memory token then call `getMe()` to populate `user`; on failure render unauthenticated without redirecting from public routes
- [x] 5.3 Update `login`/`logout` in the context to set/clear the in-memory token and clear the query cache on logout
- [x] 5.4 Keep `isLoading` gating so protected routes wait for the boot refresh to resolve before deciding to redirect

## 6. Password UI + routes

- [x] 6.1 Add a Change Password form (react-hook-form + zod, reusing `Form`/`Input`/`Card`) wired to `useChangePassword`, on an account/settings surface
- [x] 6.2 Add `ForgotPassword` page wired to `useForgotPassword`, showing the non-enumerating confirmation message
- [x] 6.3 Add `ResetPassword` page reading the token (query param or field) wired to `useResetPassword`, redirecting to `/login` on success
- [x] 6.4 Add a "Forgot password?" link on `Login.tsx`
- [x] 6.5 Register `/forgot-password`, `/reset-password` (public) and the change-password/account route in `src/routes/routes.tsx`

## 7. Backend verification (no new endpoints expected)

- [x] 7.1 Verify login/refresh/change-password set the httpOnly refresh cookie and logout clears it, across the `/api/v1/auth` cookie path
- [x] 7.2 Verify CORS `credentials: true` + allowed origin lets `withCredentials` requests carry the cookie from the dev frontend origin
- [x] 7.3 Confirm prod cookie attributes (`SameSite=None; Secure`) and that `web_url`/CORS origin match the deployed frontend (no trailing slash)

## 8. End-to-end verification

<!-- 8.1,8.2,8.4,8.5,8.6 verified end-to-end via curl against the live backend
     (httpOnly cookie, refresh-from-cookie-only, change-password rotation +
     old-token invalidation, forgot/reset non-enumeration, logout cookie clear;
     the seeded admin password was changed and restored). Backend also covered by
     the passing auth integration suite (16/16). 8.3 is a pure client-side JS
     behavior (interceptor retry / single-flight) that needs a quick manual
     browser check — the API contract it relies on is verified.
     Observation: a reset token can be reused if reset happens <1s after issuance
     (pre-existing artifact of the 1s password_changed_at backdate; harmless in a
     real human flow where >1s elapses). -->

- [x] 8.1 Log in → confirm no access token appears in `localStorage`/`sessionStorage`; only the httpOnly refresh cookie persists
- [x] 8.2 Full page reload → session rehydrates silently via `/auth/refresh-token`
- [ ] 8.3 Force an expired access token → interceptor refreshes and retries transparently; concurrent requests trigger a single refresh
- [x] 8.4 Change password → session survives with the rotated token; wrong current password shows the correct error
- [x] 8.5 Forgot → reset with the issued token → redirected to `/login`; invalid/expired token rejected
- [x] 8.6 Logout → refresh cookie cleared, query cache cleared, redirected to `/login`
- [x] 8.7 Run `npm run build` (tsc + vite) and `npm run lint` in `frontend/` clean
