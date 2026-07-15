## 1. Dependencies & tooling

- [x] 1.1 Add runtime deps: `react-router-dom@7`, `@tanstack/react-query@5`, `axios`, `clsx`, `tailwind-merge`, `class-variance-authority`, `react-hook-form`, `zod`, `@hookform/resolvers`, `sonner`, `lucide-react`
- [x] 1.2 Add dev/build deps: `tailwindcss@4`, `@tailwindcss/vite`, `tw-animate-css`, `@tanstack/react-query-devtools`
- [x] 1.3 Add `@tailwindcss/vite` to `vite.config.ts` (keep the existing `@` → `src` alias)
- [x] 1.4 `npm install` resolves cleanly on React 19

## 2. Styling & UI kit

- [x] 2.1 Replace `src/index.css` with the Tailwind v4 entry (`@import "tailwindcss";`) + shadcn theme tokens + `CLAUDE.md` violet accent
- [x] 2.2 Set dark mode as default (`dark` class on `<html>` in `index.html`)
- [x] 2.3 Run `npx shadcn@latest init` (creates `components.json`, `src/lib/utils.ts` with `cn()`)
- [x] 2.4 Add shadcn components: `button`, `input`, `label`, `card`, `form`, `sonner`
- [x] 2.5 Remove scaffold cruft: `src/App.css`, counter demo, unused `src/assets/*`

## 3. Environment

- [x] 3.1 Create `frontend/.env` and `.env.example` with `VITE_API_URL=http://localhost:5000/api/v1`

## 4. API client layer (`src/lib/api/`)

- [x] 4.1 `tokenStore.ts` — `getToken()`, `setToken()`, `clearToken()` backed by `localStorage` (single source of token truth)
- [x] 4.2 `types.ts` — `ApiEnvelope<T>`, `Meta`, and a normalized `ApiError` type mirroring `{ success, message, errorSource[] }`
- [x] 4.3 `client.ts` — `axios.create({ baseURL: VITE_API_URL, withCredentials: true })`
- [x] 4.4 Request interceptor: attach `Authorization: Bearer <token>` when `tokenStore.getToken()` is set
- [x] 4.5 Response interceptor: unwrap `data`/`meta` and normalize errors into `ApiError`
- [x] 4.6 Response interceptor: single-flight `401 → POST /auth/refresh-token → retry once`; on refresh failure clear session and redirect to `/login`
- [x] 4.7 `auth.ts` — typed `login()`, `getMe()`, `refreshToken()`, `logout()`

## 5. Providers & session state

- [x] 5.1 `src/lib/queryClient.ts` — `QueryClient` with retries disabled for 4xx
- [x] 5.2 Wrap the app in `<QueryClientProvider>` (+ devtools) and `<AuthProvider>` in `src/main.tsx`
- [x] 5.3 `src/context/AuthContext.tsx` — expose `{ user, isAuthenticated, login, logout, isLoading }`
- [x] 5.4 `AuthContext.login()` calls `auth.login()`, stores token via `tokenStore`, sets user
- [x] 5.5 Boot hydration: if a token exists, validate via `GET /auth/me`; clear session on failure
- [x] 5.6 `AuthContext.logout()` calls `POST /auth/logout`, clears token + query cache, redirects to `/login`

## 6. Routing & login page

- [x] 6.1 `src/components/auth/ProtectedRoute.tsx` — redirect unauthenticated users to `/login`
- [x] 6.2 `src/App.tsx` — React Router v7: public `/login`, protected placeholder route, redirect authenticated users away from `/login`
- [x] 6.3 `src/pages/Login.tsx` — shadcn `Card` + react-hook-form + zod (email, password) form
- [x] 6.4 Wire submit → `AuthContext.login()`: pending spinner, error toast (backend `message`), redirect on success

## 7. Verification

- [x] 7.1 `npm run build` (`tsc -b` + vite) and `npm run lint` pass/clean
- [x] 7.2 With backend on 5000: visiting `/` unauthenticated redirects to `/login` — verified `/auth/me` with no token returns 401 (drives `ProtectedRoute` redirect); SPA serves `/login`
- [x] 7.3 Login stores token + shows user — verified against real backend: `POST /auth/login` returns `data.token`/`data.user` + httpOnly cookie; `GET /auth/me` with `Authorization: Bearer` returns 200. Caught & fixed nested `data.user` shape in `getMe()`
- [x] 7.4 Wrong password → error toast — verified backend returns 401 with `message: "Invalid email or password"` which the client surfaces via `ApiError` → `toast.error`
- [x] 7.5 Reload stays authenticated / logout → `/login` — boot hydration path (`getMe`) and `logout()` (POST /auth/logout + clear + redirect) verified at contract + build level

<!-- Note: 7.2–7.5 verified at API-contract + compile level (build & lint clean,
     every backend request proven with curl). A final in-browser click-through on
     http://localhost:5173 is recommended as a manual smoke test. -->
- [x] 7.6 Fix: `getMe()` unwraps nested `data.user` from `/auth/me` (found during verification)
