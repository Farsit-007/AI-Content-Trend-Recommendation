## Context

`useTeamId()` today resolves to `VITE_DEFAULT_TEAM_ID` or `user.team_ids[0]` with no way for a user to change it — there is no switcher. There is also no UI over the team-level personalization surface the backend already exposes in part: `PATCH /teams/:id` (voice profile), `GET /teams/:id/categories`, and the full brand-voice-examples CRUD API. Two of the four settings sections (category subscriptions, default style pack) depend on backend capabilities landing in sibling plans 5A and 6A respectively, which may ship before, after, or never relative to this change — the design must not assume ordering.

Separately, `team.service.ts`'s `listTeams` only returns the all-teams branch for role `'admin'`; a `super_admin` falls into the membership-scoped branch and typically gets `[]`. This change's switcher is the first UI consumer of `listTeams` for a `super_admin`, so the fix ships alongside it rather than sitting unfixed in the backend.

This is change 8C, the last of three frontend changes (8A feed, 8B generate editor, 8C here) that together make the vision's configure → browse → generate → tweak → copy loop reachable end-to-end through the UI.

## Goals / Non-Goals

**Goals:**
- A team switcher that works everywhere a team-scoped page reads `useTeamId()`, without touching those pages' call sites.
- A settings page where an admin can see and change everything that currently requires a raw API call: voice profile, subscriptions, style pack, brand-voice examples.
- Non-admins get an honest, non-broken read-only view instead of hidden controls or doomed 403s.
- Sections tied to unshipped backend capabilities (5A, 6A) degrade to "hidden" rather than error, so this change is safe to ship in any order relative to those plans.
- Fix the `super_admin` team-listing gap this change depends on.

**Non-Goals:**
- Team creation, deletion, or membership management (invite/remove members) — out of scope, existing team CRUD is unaffected beyond the one-line `listTeams` fix.
- Style pack authoring/editing (6A's own UI, if any) — this page only *selects* a default pack from `listStylePacks()`.
- Retrying/backfilling subscription or style-pack data model migrations — those belong to 5A/6A.
- Any change to how `PATCH /teams/:id` authorization works server-side (already admin-gated); this change only respects that gate in the UI.

## Decisions

**1. Team selection lives in a React context (`TeamProvider`), not prop drilling.**
`TeamProvider` wraps the dashboard layout and owns the resolution order: env override (`VITE_DEFAULT_TEAM_ID`, if set, wins — preserves existing single-team deploys/demos) → a `localStorage`-persisted selection → the first team in the user's membership list. `lib/useTeamId.ts` keeps its existing signature (a hook returning a team id string) but reads from the context internally, so Feed/Generate/Report/Drafts pick up switching with zero call-site changes.
*Alternative considered:* passing the active team id down through route/query params. Rejected — it would touch every existing team-scoped page's routing and doesn't survive a page reload as cleanly as `localStorage`.

**2. Stale stored id falls back, never hard-fails.**
On mount, `TeamProvider` fetches `listTeams()`; if the `localStorage`-stored id isn't in the returned list (team deleted, user removed, list changed), it silently falls back to the first membership and re-persists that choice. No error state is shown for this — it's a routine reconciliation, not a fault.

**3. The `super_admin` `listTeams` fix ships in this change.**
One-line role-check change in `team.service.ts`'s `listTeams` (`role === 'admin'` → `role === 'admin' || role === 'super_admin'`), plus one integration test: a super_admin with no membership in a given team still receives it in the list. This is a bug fix aligning behavior with the role's intended scope, not a new requirement — see proposal's Modified Capabilities (none).

**4. RBAC is rendered honestly, not just enforced server-side.**
The settings page fetches `getTeam(id)` → `{team, members}` and derives the current user's role from `members`. Non-admins see every section's current values but all inputs are `disabled` with a shared hint ("Ask a team admin to change this") and no save/add/delete controls render as actionable. This avoids a UI that lets a non-admin fill out a form only to hit a 403 on submit.
*Alternative considered:* hide sections entirely for non-admins. Rejected — a non-admin still benefits from seeing the team's current configuration (e.g., what brand-voice examples exist).

**5. Subscriptions and style-pack sections feature-detect independently, once per mount.**
- Category subscriptions: rendered directly from whatever the team document / `PATCH` response shape supports today; if the field is absent (pre-5A backend), the section hides. No separate capability-probe request — presence/absence of the field on the fetched team document is the signal.
- Default style pack: `listStylePacks()` is called once; if it errors (404/pre-6A), the section hides. A successful-but-empty list still renders the section (with an appropriate empty option), since that's a valid post-6A state distinct from the endpoint not existing.
This mirrors 8B's established pattern (`GeneratedFormats` render-what-returns, style-pack feature-detection) so the codebase has one consistent degradation idiom across 8B and 8C.

**6. Brand-voice examples section is always present** (its CRUD API exists today, independent of 5A/6A) and carries the educational empty state from `RAG-BANGLA-PLAN.md` §1.3b to drive adoption: "Add 25-30 of your real posts — every generation copies your style from these."

**7. Forms use `react-hook-form` + the existing `ui/form` primitives**, matching the kit already in the frontend (`components/ui/form`), with react-query mutations invalidating the relevant query key on success (optimistic where cheap — e.g., brand-voice list add/delete — not for the voice-profile PATCH, which is a single low-frequency save).

**8. Sidebar placement:** `settings/team` is added to `userPaths` alongside the existing `settings/platforms` entry, grouped under a "Settings" section header if the sidebar generator supports grouping, otherwise as an adjacent flat entry — implementer verifies against `sidebarItemsGenerator.tsx`'s actual capabilities rather than assuming.

## Risks / Trade-offs

- **[Risk] `localStorage` selection can go stale across browser profiles/devices** (a user's selection on one device doesn't follow them to another) → **Mitigation:** acceptable for this scope; the fallback-to-first-membership behavior (Decision 2) means a stale/absent value never breaks the app, just resets the convenience.
- **[Risk] Feature-detecting the style-pack section via a failed fetch conflates "endpoint doesn't exist yet" with "transient network error"** → **Mitigation:** distinguish by status code where practical (404 → hide section; other errors → show an inline retry, don't silently hide); acceptable given this is a one-directional rollout (pre-6A → post-6A), not a flapping state.
- **[Risk] Backend `listTeams` fix changes response shape/size for super_admins in production the moment it ships** → **Mitigation:** it's strictly additive (more teams returned, same shape) and is exactly the intended behavior per the role's definition; covered by a new integration test before merge.
- **[Trade-off] Read-only rendering for non-admins duplicates each section's display logic slightly (value display vs. editable control)** → accepted; the alternative (a single generic read-only wrapper) added more abstraction than four small sections warrant.

## Migration Plan

1. Ship the backend `listTeams` one-liner + test first (independently deployable, no frontend dependency) — `backend/src/app/modules/Team/team.service.ts`.
2. Add `lib/api/teams.ts`, `lib/api/brandVoice.ts` (pure additions, no behavior change).
3. Add `TeamProvider` + rewire `useTeamId.ts`; verify every existing team-scoped page still resolves the same id it did pre-change for a single-team user (regression check, not just new-feature check).
4. Add the Navbar dropdown (hidden when ≤1 team, so single-team users see no UI change).
5. Add the settings page + route entry last, once the switcher and API modules are in place.
6. No data migration; no rollback complexity beyond reverting the commits — no schema changes on the frontend, and the backend change is a pure role-check widening.

## Open Questions

- Does `sidebarItemsGenerator.tsx` currently support grouped sidebar sections, or only a flat list? Resolve during implementation (Decision 8) — if unsupported, ship `settings/team` as an adjacent flat entry rather than adding grouping support as unplanned scope.
- Exact shape of the "effective categories" the brand-voice add form's optional category select should offer — proposal says `GET /teams/:id/categories`; confirm this returns a shape suitable for a plain select (implementer to check `team.service.ts` response during Task 2.1).
