## Why

The app now has authenticated routing (login → gated Home) but no persistent navigation shell. Users have no way to move between sections, see who they're logged in as, or log out from anywhere except the placeholder Home page. We want the polished top navigation from `@shadcnblocks/navbar1` as a starting point, adapted to Growth Studio's brand, routes, auth state, and role model rather than dropped in as a generic marketing bar.

## What Changes

- Split routing into **public** (`/` landing, `/about`, `/login`) and **protected** (`/dashboard/*`) areas. Public pages are reachable without auth; the dashboard is gated and redirects to `/login`.
- Add a persistent top **navbar** rendered on all `/dashboard/*` routes as an app-shell layout, plus a lightweight **public navbar** for the public pages.
- Base the structure on `npx shadcn add @shadcnblocks/navbar1`, then strip the marketing-only pieces (mega-menu product grid, pricing/blog links, "Sign up" CTA) and re-skin it to the Growth Studio design tokens (`gradient-text` brand, `glass-card`, dark-mode default).
- Brand/logo on the left links to `/dashboard`; primary nav links map to real dashboard routes (`/dashboard/feed`, `/generate`, `/report`, `/chat`) with **Admin** (`/dashboard/admin`) shown only to `admin` / `super_admin`.
- Right side is **auth-aware**: shows the current user's name/role and a Log out action when authenticated; there is no public "Sign up".
- Responsive mobile menu (sheet/drawer) below the `md` breakpoint, matching the desktop links and auth actions.
- Active-route highlighting via React Router `NavLink`.
- Introduce an authenticated **AppLayout** (shell with `<Outlet />`) so the navbar wraps gated pages; move the current inline `Home` under it.

## Capabilities

### New Capabilities
- `app-navigation`: A persistent, responsive, auth-and-role-aware top navigation bar and the authenticated app-shell layout that hosts it.

### Modified Capabilities
<!-- No existing spec-level capability changes. The login/auth capability is reused as-is (read from useAuth), not modified. -->

## Impact

- **Dependencies**: `npx shadcn add @shadcnblocks/navbar1` pulls the block plus any shadcn primitives it needs (likely `navigation-menu`, `sheet`, `accordion`) into `src/components/ui/`.
- **New code**: `src/components/shared/Navbar.tsx` (adapted block) + `AppLayout.tsx` (protected shell); `PublicNavbar.tsx` + `PublicLayout.tsx` (public shell); `pages/Landing.tsx`, `pages/About.tsx`; a nav-items config.
- **Modified code**: `src/App.tsx` — public routes under `PublicLayout`, dashboard under `ProtectedRoute` → `AppLayout` at `/dashboard/*` with placeholder section routes; `pages/Login.tsx` — post-login and already-authenticated redirects now target `/dashboard`.
- **Reused, unchanged**: `useAuth()` from `@/context/auth-context` (user, role, logout), `cn()` from `@/lib/utils`, existing design tokens in `index.css`.
- **No backend impact.**
