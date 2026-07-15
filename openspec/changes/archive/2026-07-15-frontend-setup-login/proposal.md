## Why

The `frontend/` app is still a blank Vite + React 19 scaffold (only `react`/`react-dom`, a counter demo), while the backend is complete and running on port 5000. Before any feature screens can be built, the frontend needs its foundation — styling, UI library, data layer, and an API client that speaks the backend's envelope and auth contract — plus the one flow that gates everything else: user login.

## What Changes

- Establish the frontend tooling foundation: Tailwind CSS v4, shadcn/ui, React Router v7, TanStack Query v5, and a shared axios client.
- Add a shared API client with request/response interceptors: attaches the Bearer access token, sends `withCredentials`, unwraps the `{ success, message, meta, data }` envelope, normalizes errors, and performs a single-flight `401 → POST /auth/refresh-token → retry` refresh.
- Abstract the access-token source behind a single `tokenStore` module (localStorage today) so the backend's planned move from token-in-body to httpOnly-cookie auth is a one-file change.
- Add an `AuthContext` that manages the session: login, boot-time hydration via `GET /auth/me`, and logout.
- Implement the **Login page** (`/login`) with a react-hook-form + zod form calling the real backend, error toasts, and redirect on success.
- Add a `ProtectedRoute` wrapper and a minimal authenticated placeholder route so the login flow lands somewhere gated. **No dashboard or other feature pages/API modules are in scope.**

## Capabilities

### New Capabilities
- `frontend-foundation`: The frontend application shell and shared infrastructure — build tooling (Tailwind v4, shadcn/ui), routing, the TanStack Query provider, and the shared API client whose interceptors handle auth headers, credentials, envelope unwrapping, and error normalization.
- `user-login`: The user-facing login flow and client-side session — the login page and form, access-token persistence via `tokenStore`, boot-time session hydration, protected-route redirection, logout, and automatic 401 token refresh.

### Modified Capabilities
<!-- None — no existing specs. -->

## Impact

- **New frontend dependencies:** `react-router-dom`, `@tanstack/react-query`, `axios`, `tailwindcss@4`, `@tailwindcss/vite`, shadcn/ui and its peers (`clsx`, `tailwind-merge`, `class-variance-authority`), `react-hook-form`, `zod`, `@hookform/resolvers`, `sonner`, `lucide-react`.
- **New/modified files:** `frontend/vite.config.ts`, `index.html`, `src/index.css`, `src/main.tsx`, `src/App.tsx`; new `src/lib/api/*`, `src/lib/queryClient.ts`, `src/lib/utils.ts`, `src/context/AuthContext.tsx`, `src/components/auth/ProtectedRoute.tsx`, `src/components/ui/*`, `src/pages/Login.tsx`; new `.env`/`.env.example`, `components.json`.
- **Backend:** no changes required — CORS already allows `http://localhost:5173` with `credentials: true`. Consumes existing `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh-token`, `POST /auth/logout`.
- **Depends on:** backend reachable at `VITE_API_URL=http://localhost:5000/api/v1`.
