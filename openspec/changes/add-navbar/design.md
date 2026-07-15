## Context

The frontend (Vite + React 19, React Router v7, Tailwind v4, shadcn "new-york") currently has only `/login` and a gated inline `Home` in `App.tsx`. There is no shared layout or navigation. Auth state comes from `useAuth()` (`@/context/auth-context`), exposing `user` (`{ name, email, role }` where role ∈ `super_admin | admin | user`), `isAuthenticated`, and `logout()`. Design tokens (`gradient-text`, `glass-card`, `btn-glow`, violet accent) live in `index.css`; dark mode is the default.

The request is to use `npx shadcn add @shadcnblocks/navbar1` as a starting point but adapt it to this project rather than ship the generic marketing bar it produces.

## Goals / Non-Goals

**Goals:**
- A persistent, responsive top navbar wrapping all authenticated routes.
- Reuse the shadcnblocks navbar1 structure/markup as scaffolding, re-skinned to Growth Studio tokens.
- Auth-aware (user + logout, no signup) and role-aware (Admin link gated).
- Active-route highlighting and a working mobile menu.
- An `AppLayout` shell so pages render under the navbar via `<Outlet />`.

**Non-Goals:**
- Building out the actual Feed/Generate/Report/Chat/Admin pages — only placeholder routes so nav targets resolve.
- A collapsible sidebar / dashboard chrome (the CLAUDE.md dashboard layout) — out of scope here.
- Theme toggle UI (dark stays default; a toggle can come later).
- Any backend or auth-logic changes.

## Decisions

**1. Use navbar1 as scaffold, then adapt — don't consume verbatim.**
Run `npx shadcn add @shadcnblocks/navbar1` to pull the block and its primitive deps (`navigation-menu`, `sheet`, `accordion`) into `src/components/ui/`. Then copy/rename the generated block to `src/components/shared/Navbar.tsx` and edit: replace mega-menu/product/pricing/blog items with our route list, swap the logo for the `gradient-text` brand, remove the "Sign up" CTA, and wire links to React Router. *Alternative considered:* hand-build from primitives — rejected because the block already solves the responsive desktop/mobile split cleanly and the ask is explicitly to start from navbar1.

**2. Centralize nav items in a typed config.**
A single `navItems` array (`{ label, to, icon?, roles? }`) drives both desktop and mobile renders, keeping them in sync and making role-gating one filter (`items.filter(i => !i.roles || i.roles.includes(user.role))`). *Alternative:* duplicate JSX per breakpoint — rejected (drift risk, contradicts the spec's "same links" requirement).

**3. Navigation via React Router `NavLink`, not `<a>`.**
navbar1 ships plain anchors; swap to `NavLink` so we get `isActive` for highlighting and client-side routing. Mobile menu items call `navigate()` and close the sheet via local `open` state.

**4. Introduce `AppLayout` shell + public/protected split.**
Routing splits into two areas. Public pages (`/` landing, `/about`) render under a `PublicLayout` with a lightweight `PublicNavbar` (brand, Home/About, auth-aware "Log in"/"Dashboard" CTA); `/login` stands alone. The authenticated app lives under `/dashboard/*`, gated by `ProtectedRoute` and wrapped in `AppLayout` (`<Navbar />` + `<main><Outlet /></main>`). Section placeholders (`feed`, `generate`, `report`, `chat`, `admin`) are nested children so links resolve; `admin` still relies on nav-level role gating (route-level guarding can be a later change). `Login` redirects to `/dashboard` on success. *Alternative considered:* keep the app at top-level routes with `/` as the authenticated home — rejected because the product needs public marketing pages (`/`, `/about`) reachable without login, matching the CLAUDE.md structure.

**5. Styling via existing tokens + `cn()`.**
Re-skin with `glass-card` for the bar surface, `gradient-text` brand, violet active state; all conditional classes through `cn()` from `@/lib/utils`. Verify dark mode at 375px per project rules.

## Risks / Trade-offs

- **shadcnblocks registry/auth may not be configured** → the `npx shadcn add @shadcnblocks/navbar1` command could fail or require a registry entry. Mitigation: if it fails, hand-assemble the equivalent from already-present shadcn primitives (`button`) plus adding `navigation-menu`/`sheet` from the standard shadcn registry; the adapted output is the same either way.
- **Block pulls heavy primitives we only partly use** → slight bundle cost. Mitigation: keep only the primitives actually referenced; tree-shaking handles the rest.
- **Placeholder routes could look broken in demo** → render simple titled placeholders (not blank) so navigation visibly works.
- **Admin link gated only in the navbar, not the route** → a `user` could still hit `/admin` by URL. Accepted for this change (nav-level gating is the stated scope); route-level guard tracked as an open question.

## Open Questions

- Should `/admin` (and other role-restricted routes) also be guarded at the route level now, or in a follow-up change? (Leaning follow-up.)
- Do we want a dark/light theme toggle in the navbar's account area later? (Out of scope now.)
