## Context

The dashboard is entirely client-rendered (`app/(dashboard)/layout.tsx` and page components are `"use client"`). There is no login page and no auth context in the frontend today — `lib/api/config.ts` reads a bearer token out of `localStorage("auth_token")` if present, but nothing ever writes it except manual setup for the demo. Team scoping is currently a single build-time env var (`NEXT_PUBLIC_DEFAULT_TEAM_ID`) read directly in three files:

- `lib/api/config.ts` — exports `TEAM_ID`
- `lib/api/teams.ts` — categories endpoints
- `lib/api/newsItems.ts` — news item mutations
- `components/generate/ContentGenerator.tsx` — has its own duplicate `TEAM_ID` read plus its own `auth_token` read

Backend already has what's needed: `GET /auth/me` (requires auth; returns `{ user, team_ids }`) and `GET /teams` (requires auth; lists all teams the caller can see — no team-scoping filter on the list endpoint itself, callers cross-reference against `team_ids`).

## Goals / Non-Goals

**Goals:**
- Resolve the active team from real backend state (`/auth/me` + `/teams`) instead of a build-time constant.
- Let a user who belongs to more than one team switch between them from the dashboard header, with the choice persisted across reloads.
- Keep every existing team-scoped API call working with zero behavior change for a user with exactly one team.
- Keep the app usable without login for local/demo purposes (no regressions to the current no-auth-token path).

**Non-Goals:**
- Building a login page or auth flow. `auth_token` sourcing is unchanged (still just read from `localStorage` if present).
- Server-side rendering of team-scoped data or cookie-based team selection — this stays a client-side context, consistent with the rest of the dashboard.
- Changing backend authorization (`requireTeamAccess`) or the shape of `/auth/me` / `/teams` responses.

## Decisions

**React context (`TeamProvider`/`useTeam`) over prop drilling or a global store.** The dashboard layout already wraps every page in client providers (`SidebarProvider`, `TooltipProvider`); adding one more context is consistent with the existing pattern and avoids pulling in a state library for a single piece of shared state.

**Resolve team list client-side from `/auth/me` + `/teams`, not a new combined endpoint.** Both endpoints already exist and are cheap (small N). Adding a backend endpoint purely to save one round trip isn't worth the change surface for a hackathon timeline. `TeamProvider` calls `/auth/me` to get `team_ids`, then `/teams` to get `{ id, name }` for all teams, and filters client-side to the ones in `team_ids`.

**`localStorage` for persistence, keyed `active_team_id`.** Matches the existing `auth_token` persistence pattern in this codebase (`lib/api/config.ts`). No cookie/SSR need since nothing here is server-rendered.

**Fallback to `NEXT_PUBLIC_DEFAULT_TEAM_ID` stays, but only as a last resort.** Resolution order: (1) stored `active_team_id` if it's still in the user's current `team_ids`, (2) first entry in `team_ids`, (3) `NEXT_PUBLIC_DEFAULT_TEAM_ID` if `/auth/me` failed or returned no teams. This preserves today's no-login demo path exactly.

**`TEAM_ID` constant is removed, not kept as a deprecated alias.** Per CLAUDE.md conventions, no backwards-compatibility shims — the three call sites are updated directly to consume `useTeam()`. This is called out as **BREAKING** in the proposal since it's a named export removal, even though it's an internal module with no external consumers.

**`TeamSelector` renders conditionally, not always.** Single-team users (the common case today) see a static label, not a dropdown with one disabled option — avoids implying a choice that doesn't exist.

## Risks / Trade-offs

- **[Risk]** `ContentGenerator.tsx` and the two `lib/api/*.ts` files are plain functions, not components — they can't call `useTeam()` directly. → **Mitigation**: `TeamProvider` also mirrors the active team id into a small module-level variable (updated via `useEffect` on change) that the non-component `lib/api` functions read synchronously, the same way `getAuthToken()` already reads `localStorage` synchronously outside React. This keeps the existing call signatures (`fetchEffectiveCategories()`, no `teamId` param) intact rather than threading a parameter through every call site.
- **[Risk]** `/auth/me` or `/teams` failing (network error, no token) must not blank out team-scoped features. → **Mitigation**: any fetch failure falls through to the `NEXT_PUBLIC_DEFAULT_TEAM_ID` fallback per the resolution order above; `TeamProvider` never throws or blocks rendering.
- **[Risk]** Stored `active_team_id` from a previous session could reference a team the user no longer belongs to (removed from team). → **Mitigation**: on load, the stored id is validated against the freshly-fetched `team_ids` and discarded if not present, falling back to the first current team.

## Migration Plan

1. Add `TeamProvider` + `useTeam` and wrap it around the dashboard layout's existing providers.
2. Add the module-level synchronous accessor used by non-component API helpers.
3. Update `lib/api/config.ts`, `lib/api/teams.ts`, `lib/api/newsItems.ts`, `components/generate/ContentGenerator.tsx` to read the active team id through it instead of the static constant.
4. Add `TeamSelector` to the dashboard header.
5. No backend deploy or data migration needed. Rollback is a plain revert since no persisted server-side state changes.

## Open Questions

None — scope confirmed with the user as the real-team-selector option ahead of this design.
