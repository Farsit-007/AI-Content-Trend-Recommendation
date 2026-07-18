## Why

Today there is no personalization control surface and no real team switcher: `useTeamId()` resolves to an env var or the first membership with no UI to change it, and there is no page to set a team's voice profile, category subscriptions, default style pack, or brand-voice examples. Every backend capability from plans 5A/6A and the existing brand-voice CRUD API is invisible without this UI. This is the last of the three frontend changes (8A feed, 8B generate editor, 8C here) that make the vision's end-to-end loop — configure a team, browse its personalized feed, generate, tweak, copy — reachable entirely through the UI, with no API calls by hand.

## What Changes

- Add `lib/api/teams.ts` (`listTeams`, `getTeam`, `updateTeam`, `getTeamCategories`) and `lib/api/brandVoice.ts` (CRUD over the existing brand-voice-examples API).
- Add `pages/dashboard/settings/Team.tsx` at `/dashboard/settings/team` with four sections: voice profile (default language + custom instructions, ≤500 chars), category subscriptions (fixed-taxonomy checkboxes, empty = all), default style pack (select), and brand-voice examples manager (list/add/delete with an educational empty state).
- Non-admin members see all four sections read-only with an explanatory hint instead of disabled/broken save controls.
- Subscriptions and style-pack sections feature-degrade independently: hidden (not erroring) when the backing capability (5A / 6A) isn't deployed yet.
- Add `context/TeamProvider.tsx`, a React context that persists the selected team id to `localStorage` and resolves it as env override → stored selection → first membership (falling back on a stale/invalid stored id); rewire `lib/useTeamId.ts` to read from it while keeping its existing signature so Feed/Generate/Report/Drafts pick up switching for free.
- Add a Navbar team dropdown (team name + checkmark on the active team; hidden when the user has ≤1 team).
- Add a `settings/team` entry to `user.routes.tsx` (sidebar, grouped under existing Settings entries).
- **BREAKING (backend, one-liner)**: fix `team.service.ts` `listTeams` so `super_admin` (not just `admin`) receives the all-teams branch instead of falling into the empty membership-scoped result; add an integration test covering a super_admin listing teams it has no membership in.

## Capabilities

### New Capabilities
- `frontend-team-settings`: the `/dashboard/settings/team` page (voice profile, category subscriptions, default style pack, brand-voice examples manager) plus the cross-app team switcher (`TeamProvider`, rewired `useTeamId`, Navbar dropdown) and the backing `super_admin` team-listing fix.

### Modified Capabilities
- None. (`team.service.ts`'s `listTeams` role check is a bug fix bringing behavior in line with intended admin-tier access, not a change to a previously specified requirement — no existing spec file covers it.)

## Impact

- **Frontend**: new files `lib/api/teams.ts`, `lib/api/brandVoice.ts`, `context/TeamProvider.tsx`, `pages/dashboard/settings/Team.tsx`; modified `lib/useTeamId.ts`, `components/shared/Navbar.tsx` (or equivalent), `routes/user.routes.tsx`. No new dependencies — reuses `@tanstack/react-query`, `react-hook-form` + existing `ui/form`, `sonner`.
- **Backend**: one-line role-check fix in `backend/src/app/modules/Team/team.service.ts` (`listTeams`) plus one new integration test in the Team test suite. Live verification surfaced the identical bug in `BrandVoiceExample/brandVoiceExample.service.ts`'s `assertTeamAccess` (and its two callers) — a super_admin with no team membership got 403/empty results managing brand-voice examples, which is exactly the Brand Voice section this change ships. Fixed the same way, with a new `brandVoiceExample.integration.test.ts` covering it.
- **Consumers**: every team-scoped page (Feed, Generate, Drafts, Report) starts reading the active team id from `TeamProvider` instead of only the static env/first-membership resolution — behavior for single-team users is unchanged.
- **Sequencing**: safe to ship before or after plans 5A (subscriptions) and 6A (style packs); those two sections hide themselves until the corresponding backend capability exists.
