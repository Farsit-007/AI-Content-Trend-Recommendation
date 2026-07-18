# Tasks — Team Readiness Gating

## 1. Backend: readiness helper

- [x] 1.1 Add `isTeamReady(teamId): Promise<boolean>` (e.g. `team.service.ts`): true iff
      `subscribed_categories.length > 0` and `BrandVoiceExample.exists({ team_id })`.
- [x] 1.2 Unit test the helper directly against the four scenarios in the spec.
      (`team.integration.test.ts` — `describe('TeamService.isTeamReady')`, 4/4 passing.)
- [x] 1.3 Expose `team_ready` on `GET /teams/:id` response so the frontend can show a persistent
      setup banner outside the Feed/Chat pages too.
- [x] 1.4 Fix `seedDemoAccounts.ts`: it currently seeds `BrandVoiceExample`s but sets
      `subscribed_categories: []` in the `$setOnInsert` block (`seedDemoAccounts.ts` around line
      60) — under this change the demo team would fail readiness and show the not-ready state by
      default, which defeats the point of a seeded demo. Add a non-empty default (e.g.
      `['AI', 'Web Dev']`) to that `$setOnInsert`. Also audit any other pre-existing real teams'
      `subscribed_categories`/`BrandVoiceExample` state before rollout so none regress
      unexpectedly. Implemented with a backfill for a demo team seeded before this change existed
      (updates `subscribed_categories` in place if still `[]`). Auditing *other, real* pre-existing
      teams in this deployment's live database is an operator action, not something this pass can
      verify without live DB access.

## 2. Backend: gate the three read/write paths

- [x] 2.1 `newsItem.service.ts`: when `!isTeamReady(teamId)`, short-circuit to
      `{ data: [], meta, team_ready: false }` before running the category-filter/query logic.
- [x] 2.2 `chat.service.ts`: when `!isTeamReady(teamId)`, return the fixed guidance message
      (via `resolveVoiceOptions` for language) without calling `embedForTask`/`chatCompletionForTask`.
      Still persist the user message (and this guidance reply) to `ChatMessage` for conversation
      continuity.
- [x] 2.3 `generatedContent.job.ts`: replace the standalone `BrandVoiceExample.exists` check with
      the shared `isTeamReady` helper.
- [x] 2.4 Add/update integration tests for all three (not-ready and ready paths). `chat.integration.test.ts`
      (new "team readiness gating" describe, 4 tests), `newsItem.integration.test.ts` (new "Team
      readiness gating" describe + rewritten breaking-change test, 4 tests),
      `generatedContent.job.integration.test.ts` (new not-ready-skip test). Full suite: 518/519
      passing (1 pre-existing, unrelated flaky test in `newsDedupLedger.integration.test.ts` — see
      status report).

## 3. Data: one-time NewsItem reset (operator action — requires explicit confirmation)

- [ ] 3.1 **Do not run automatically.** Once 1–2 are deployed, an operator explicitly confirms and
      runs a one-off cleanup (e.g. `mongosh` `db.news_items.deleteMany({})` or a small script) so
      the next ingestion cycle repopulates cleanly under the new gating. Coordinate timing with
      `openspec/changes/dev-data-reset-tooling` if that change's reset tool is used instead.
      **Not run by this pass** — requires explicit operator go-ahead against the live database,
      per this task's own instruction. `npm run dev:clear-news` (from dev-data-reset-tooling) is
      ready to use for this once approved.
- [ ] 3.2 Verify a subsequent ingestion run + feed request for a ready team returns fresh, properly
      scored items. **Blocked on 3.1.**

## 4. Frontend

- [x] 4.1 `Feed.tsx`: when the response has `team_ready: false`, render a "complete your team setup"
      empty state with a link to Team Settings (Category Subscriptions + Brand Voice sections)
      instead of the card grid.
- [x] 4.2 `Chat.tsx`: no special handling needed — the guidance message renders as a normal
      assistant turn.
- [x] 4.3 `lib/api/news.ts`: add `team_ready` to the response type.
- [ ] 4.4 Manual check: create a fresh team via admin, confirm Feed/Chat show the not-ready state,
      complete setup, confirm both switch to normal behavior. **Not done by this pass** — requires
      a running dev server + browser session; `npm run build`/`lint` were run clean instead (see
      status report) as the closest available substitute.
