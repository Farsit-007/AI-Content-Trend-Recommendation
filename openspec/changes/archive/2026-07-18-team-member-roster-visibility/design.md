## Context

`Team.tsx` already calls `getTeam(teamId)`, which resolves `{ team, members, team_ready }` (see
`lib/api/teams.ts`). `members` is a `TeamMember[]` (`_id`/`name`/`email`/`role`), populated
server-side in `team.service.ts::getTeamById` via `TeamMembership.find(...).populate('user_id',
'name email role')`. The admin-only `/dashboard/admin/teams` page (`AdminTeams.tsx`) already
renders this exact shape correctly, including add/remove — it's proof the data and endpoints work;
the gap is purely that `Team.tsx` never renders `members` at all.

## Goals / Non-Goals

**Goals:**
- Every team member can see who else is on their team from Team Settings.
- Admins keep a fast way to remove a member without leaving Team Settings for the separate admin
  console.

**Non-Goals:**
- No "add member" flow on this page — `/dashboard/admin/teams` already covers that, and adding it
  here would duplicate logic without fixing the actual reported gap (visibility, not add capability).
- No new backend endpoint or response-shape change — `GET /teams/:id` already returns everything
  needed.

## Decisions

1. **New `TeamMembersSection` component, not inlined into `Team.tsx`** — matches this codebase's
   established pattern of one component per Team Settings section (`VoiceProfileSection`,
   `CategorySubscriptionsSection`, etc.), keeping `Team.tsx` itself a thin composition of sections.
2. **Remove action reuses `removeTeamMember` from `lib/api/teams.ts` directly** (already used by
   `AdminTeams.tsx`) — no new API client function needed, just a new call site with its own
   `useMutation` and `queryClient.invalidateQueries({ queryKey: ['team', teamId] })` on success, so
   the roster and any other Team Settings pieces reading team data stay in sync.
3. **Read-only for non-admins** — mirrors the existing `isAdmin` check already computed in
   `Team.tsx` for the voice-profile/category-subscription save gating; the remove button's presence
   is gated on the same flag, not a new one.

## Risks / Trade-offs

- [A team with a member the requesting user cannot otherwise see full details on] → not a concern
  here: `GET /teams/:id` already returns name/email for every member to anyone with team access
  (`requireTeamAccess`), so no new information is exposed beyond what the API already sends.
- [Removing the last member/self-removal edge cases] → out of scope for this fix; the underlying
  `DELETE /teams/:id/members/:userId` endpoint's existing behavior is unchanged, this proposal only
  surfaces it in a new place.

## Migration Plan

None — frontend-only, additive UI, no data migration, no breaking API change. Rollback is a plain
revert of the new component and its one call site in `Team.tsx`.
