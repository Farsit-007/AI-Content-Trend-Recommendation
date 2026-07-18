## 1. Frontend: roster section

- [x] 1.1 Create `frontend/src/components/team/TeamMembersSection.tsx`: props `members: TeamMember[]`,
      `isAdmin: boolean`, `teamId: string`; renders a `glass-card` list of name/email/role rows,
      matching this codebase's existing Team Settings section styling.
- [x] 1.2 When `isAdmin`, render a remove ("UserMinus") action per row wired to a
      `useMutation(() => removeTeamMember(teamId, memberId))`; on success, toast + invalidate
      `['team', teamId]`.
- [x] 1.3 Empty/loading states: none needed beyond what `Team.tsx` already handles (the section only
      renders once `teamQuery.data` exists).

## 2. Wire into Team.tsx

- [x] 2.1 Import and render `TeamMembersSection` in `Team.tsx`, passing
      `teamQuery.data.members`, `isAdmin`, and `teamId`.

## 3. Verification

- [x] 3.1 `cd frontend && npm run build && npm run lint` — clean.
- [ ] 3.2 Manual: log in as a non-admin team member, confirm the roster renders with no remove
      action; log in as admin/super_admin on the same team, confirm the remove action appears and
      works (roster updates after removal). **Not done in this pass** — requires a running dev
      server + browser session; `npm run build`/`lint` were run clean as the closest substitute.
