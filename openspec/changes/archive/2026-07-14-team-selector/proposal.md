## Why

The frontend has no real team context: every API call that needs a `team_id` (content generation, news items, category management) reads it from a single hardcoded `NEXT_PUBLIC_DEFAULT_TEAM_ID` env var, duplicated across three files with `TODO: replace with a real team-selector` comments. The backend already exposes `GET /auth/me` (returns the current user's `team_ids`) and `GET /teams` (lists teams), but nothing in the frontend calls them. Any user with more than one team, or a deployment without that env var set, cannot use the app correctly.

## What Changes

- Add a `TeamProvider` React context that on load calls `GET /auth/me` to get the current user's `team_ids`, resolves team names via `GET /teams`, and exposes the active `team_id` plus a setter.
- Persist the selected team in `localStorage` so it survives reloads; default to the first team the user belongs to when none is stored yet.
- Add a `TeamSelector` dropdown in the dashboard header, visible only when the user belongs to more than one team; a single-team user sees their team name as a static label.
- Replace all reads of the hardcoded `TEAM_ID` constant (`lib/api/config.ts`, `lib/api/teams.ts`, `lib/api/newsItems.ts`, `components/generate/ContentGenerator.tsx`) with the active team id from `TeamProvider`.
- **BREAKING**: `lib/api/config.ts` no longer exports a static `TEAM_ID` constant; call sites must read the team id from the `useTeam()` hook instead.
- Preserve today's no-auth fallback: if `GET /auth/me` fails (no token, request error) or returns zero teams, fall back to `NEXT_PUBLIC_DEFAULT_TEAM_ID` so the app keeps working for local/demo use without login.

## Capabilities

### New Capabilities
- `team-selection`: frontend capability for resolving, persisting, and switching the active team, replacing the hardcoded `TEAM_ID` constant used by team-scoped API calls.

### Modified Capabilities
(none — no existing `openspec/specs/` capabilities cover this yet)

## Impact

- **Frontend**: new `TeamProvider`/`useTeam` context, new `TeamSelector` component in the dashboard header (`app/(dashboard)/layout.tsx`), updates to `lib/api/config.ts`, `lib/api/teams.ts`, `lib/api/newsItems.ts`, `components/generate/ContentGenerator.tsx`.
- **Backend**: no changes — `GET /auth/me` and `GET /teams` already exist and are sufficient.
- **Dependencies**: none added.
