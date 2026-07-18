## 1. Backend one-liner + test

- [x] 1.1 `backend/src/app/modules/Team/team.service.ts` `listTeams`: widen the all-teams role check to include `super_admin` alongside `admin`
- [x] 1.2 Add an integration test: a `super_admin` with no membership in a given team still receives it in `listTeams`
- [x] 1.3 `cd backend && npm test` green for the Team suite

## 2. API modules

- [x] 2.1 `frontend/src/lib/api/teams.ts`: `listTeams()`, `getTeam(id)` → `{team, members}`, `updateTeam(id, patch)`, `getTeamCategories(id)`
- [x] 2.2 `frontend/src/lib/api/brandVoice.ts`: `listBrandVoiceExamples(teamId)`, `createBrandVoiceExample(payload)`, `deleteBrandVoiceExample(id)`

## 3. Team switcher

- [x] 3.1 `frontend/src/context/TeamProvider.tsx`: fetches `listTeams()`, resolves active team id via env override → `localStorage`-persisted selection → first membership, with stale-id fallback (design Decision 1-2)
- [x] 3.2 Rewire `frontend/src/lib/useTeamId.ts` to read from `TeamProvider` while keeping its existing return signature
- [x] 3.3 Wrap the dashboard layout with `TeamProvider`
- [x] 3.4 Navbar team dropdown: team name + checkmark on the active team, `setActiveTeam` on select, hidden when the user has ≤1 team
- [x] 3.5 Regression check: `TeamProvider`'s resolution order (env → stored → `user.team_ids[0]` → `teams[0]`) reduces to the original `fromEnv || user?.team_ids?.[0]` for a single-team user with no stored selection — verified by code inspection; no browser available in this sandbox to click through live (see summary)

## 4. Settings page — voice profile & brand voice

- [x] 4.1 `frontend/src/pages/dashboard/settings/Team.tsx`: fetch `getTeam(teamId)`, derive admin status from the current user's global role (matches the server's actual `requireAdmin` gate — see design deviation note)
- [x] 4.2 Voice profile section: default-language select + custom-instructions textarea (500-char counter, hard limit), `react-hook-form` + `ui/form`, `PATCH` via `updateTeam` on save, react-query invalidation on success
- [x] 4.3 Brand-voice examples section: list (content preview, platform, category, engagement hint), add form (content required, platform select, optional category from `getTeamCategories`, optional engagement hint), delete with confirm, list refetch on mutation
- [x] 4.4 Educational empty state for zero brand-voice examples (RAG-BANGLA-PLAN.md §1.3b copy)

## 5. Settings page — subscriptions & style pack (feature-degraded)

- [x] 5.1 Category subscriptions section: checkbox group over the fixed taxonomy constant; empty selection communicated as "all categories included"; section hides when the fetched team document has no subscriptions field (pre-5A)
- [x] 5.2 Default style pack section: select populated from `listStylePacks()`; section hides when that call fails (pre-6A) rather than showing an error

## 6. RBAC-aware rendering

- [x] 6.1 Non-admin path: every section's current values render, all inputs `disabled`, shared hint text ("Ask a team admin to change this"), no save/add/delete controls actionable

## 7. Routing & sidebar

- [x] 7.1 `frontend/src/routes/user.routes.tsx`: add `settings/team` entry (icon `Users`) — `sidebarItemsGenerator.tsx` only supports a flat list (open question resolved), so it ships as an adjacent entry; `adminPaths`/`supperAdminPaths` inherit it via their `...userPaths` spread

## 8. Verification

- [x] 8.1 `cd backend && npm test` — full suite, 34 suites / 274 tests green (includes the new `brandVoiceExample.integration.test.ts` — see summary for the extra fix it covers)
- [x] 8.2 `cd frontend && npm run build && npm run lint` (2 pre-existing lint errors remain in untouched `ui/sidebar.tsx`/`hooks/use-mobile.ts`, unrelated to this change)
- [x] 8.3 API-level: super_admin's `GET /teams` lists every team (live curl against the real dockerized-equivalent backend + real Atlas DB — was empty before the fix, all 3 seeded teams after)
- [ ] 8.4 UI: two-team user switches teams → feed/drafts/settings all follow; selection survives reload — not click-through verified, no browser driver available in this sandbox (see summary)
- [x] 8.5 API-level: `PATCH /teams/:id` with `voice_profile` (language + custom_instructions) saves and round-trips correctly (live curl)
- [x] 8.6 API-level: brand-voice example create/list/delete full cycle verified live (also surfaced and fixed the same super_admin-access bug in `BrandVoiceExample` — see summary); UI empty-state text not visually confirmed
- [ ] 8.7 UI: non-admin sees every section read-only with hint — implemented and type-checked, not click-through verified (see summary)
- [x] 8.8 Backend confirms: 5A/6A are already deployed on this backend (`subscribed_categories`/`default_style_pack_id` always present, `/style-packs` returns 200) — subscriptions/style-pack sections render live, not hidden
- [ ] 8.9 Pre-5A/6A hidden-section path not exercised — both capabilities are already live on this backend, so there was nothing to simulate being absent without artificially breaking the API
