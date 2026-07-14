## 1. Team context

- [x] 1.1 Add `frontend/lib/api/auth.ts` (or extend `lib/api/config.ts`) with a `fetchCurrentUser()` call to `GET /auth/me` returning `{ user, team_ids }`, and a `fetchTeams()` call to `GET /teams` returning `{ id, name }[]`
- [x] 1.2 Create `frontend/lib/team/TeamProvider.tsx` exporting `TeamProvider` and `useTeam()` (`{ teamId, teams, setTeamId, isLoading }`)
- [x] 1.3 Implement resolution order in `TeamProvider`: stored `active_team_id` (if still in current `team_ids`) → first entry in `team_ids` → `NEXT_PUBLIC_DEFAULT_TEAM_ID`
- [x] 1.4 Persist `teamId` to `localStorage` under `active_team_id` whenever it changes
- [x] 1.5 Skip the `/auth/me` call entirely when no `auth_token` is present in `localStorage`, going straight to the `NEXT_PUBLIC_DEFAULT_TEAM_ID` fallback
- [x] 1.6 Add a module-level synchronous accessor (e.g. `getActiveTeamId()`) that mirrors the current `teamId`, updated from `TeamProvider` via effect, for use by non-component API helper functions

## 2. Wire up call sites

- [x] 2.1 Update `frontend/lib/api/config.ts`: remove the static `TEAM_ID` export, replace with `getActiveTeamId()` from the team module
- [x] 2.2 Update `frontend/lib/api/teams.ts` to use `getActiveTeamId()` in place of the old `TEAM_ID` import
- [x] 2.3 Update `frontend/lib/api/newsItems.ts` to use `getActiveTeamId()` in place of the old `TEAM_ID` import
- [x] 2.4 Update `frontend/components/generate/ContentGenerator.tsx` to drop its local `TEAM_ID` constant and use `getActiveTeamId()` (or `useTeam()` directly, since it's already a client component)

## 3. UI

- [x] 3.1 Wrap `app/(dashboard)/layout.tsx` with `TeamProvider`
- [x] 3.2 Add `frontend/components/shared/TeamSelector.tsx`: dropdown when `teams.length > 1`, static label when `teams.length === 1`, hidden/omitted when `teams.length === 0`
- [x] 3.3 Place `TeamSelector` in the dashboard header next to `ThemeToggle`/`UserProfile` in `app/(dashboard)/layout.tsx`

## 4. Verification

- [x] 4.1 Manually verify: no `auth_token` set → dashboard loads using `NEXT_PUBLIC_DEFAULT_TEAM_ID`, no console errors
- [x] 4.2 Manually verify: `auth_token` set for a user with one team → header shows static team label, content generation and news actions use that team's id
- [x] 4.3 Manually verify: `auth_token` set for a user with multiple teams → selector appears, switching teams persists across reload and updates subsequent API calls
- [x] 4.4 Run `npm run typecheck` and `npm run lint` in `frontend/`
