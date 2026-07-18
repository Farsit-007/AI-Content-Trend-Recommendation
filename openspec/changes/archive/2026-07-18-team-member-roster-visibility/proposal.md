## Why

`GET /teams/:id` already returns a fully-populated `members` array (`name`/`email`/`role`), and
`Team.tsx` (the regular team-facing Team Settings page, `/dashboard/settings/team`) already fetches
it via `getTeam()` — but the component destructures only `{ team }` from the response and never
renders `members` at all. There is no `TeamMembersSection` component in `components/team/`. A
non-admin team member has no way to see who else is on their own team from the page whose entire
purpose is showing team configuration — confirmed by reading `Team.tsx` directly: the fetched data
exists, the UI to show it does not. (The separate `/dashboard/admin/teams` page, only reachable by
global admins/super_admins, does render a roster correctly via the same `members` field — this
proposal is about the regular-member-facing page, not a duplicate of that admin tool.)

## What Changes

- Add a `TeamMembersSection` component to `components/team/`, rendered in `Team.tsx`, showing every
  member's name, email, and role from the already-fetched `members` array.
- An admin/super_admin viewing their own Team Settings page additionally gets an inline "remove
  member" action per row, reusing the existing `DELETE /teams/:id/members/:userId` endpoint
  (already `requireAdmin`-gated server-side, so this is purely surfacing an existing capability, not
  a new permission).
- No backend changes — `GET /teams/:id`'s response shape is unchanged; this is a frontend-only fix.

## Capabilities

### New Capabilities
- `team-roster-visibility`: what a team member can see and do regarding their own team's roster
  from the Team Settings page.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- **Frontend:** new `frontend/src/components/team/TeamMembersSection.tsx`; `Team.tsx` renders it
  and passes through `teamQuery.data.members` (already fetched, currently discarded) plus `isAdmin`.
- **Backend:** none — reuses `GET /teams/:id` and `DELETE /teams/:id/members/:userId`, both already
  implemented and already correctly authorized.
- **Non-goal:** adding a new member from this page is out of scope — that flow already exists at
  `/dashboard/admin/teams` and duplicating it here isn't needed to fix the visibility gap.
