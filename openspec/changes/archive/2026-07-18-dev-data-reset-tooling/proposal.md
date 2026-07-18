# Dev Data Reset Tooling

## Why

Testing from a clean slate (users, teams, categories, style packs, brand voice, news items) is
currently a manual, error-prone `mongosh` exercise against the live Atlas cluster — easy to
under-delete (leaving orphaned references) or over-delete (the super admin account, which then
requires a server restart to reseed via `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`). This is a
recurring need during the hackathon build/test cycle, not a one-off, so it deserves a real,
reviewable script rather than ad-hoc commands — following the same pattern as the existing
`seed:*`/`verify:*` scripts in `backend/src/scripts/`.

## What Changes

- Add `backend/src/scripts/resetDevData.ts` (`npm run dev:reset-data`) that deletes every document
  in every application collection **except** the `User` document(s) with `role: 'super_admin'`, and
  also except nothing else — teams, team memberships, all other users, news items, dedup ledger,
  ingestion runs, generated content, style packs/examples, brand voice examples, chat messages,
  maintenance runs, LLM providers/models/keys, task defaults all get wiped.
- Hard safety rails, since this is maximally destructive: requires `NODE_ENV !== 'production'`
  (refuses otherwise), requires an explicit `--yes` flag, and prints the resolved `DATABASE_URL`
  host + a document-count summary per collection **before** deleting, with a final typed
  confirmation prompt unless `--yes` is passed non-interactively (e.g. CI).
- Add a narrower `backend/src/scripts/clearNewsItems.ts` (`npm run dev:clear-news`) for the
  lighter-weight "just re-ingest from scratch" case (clears `NewsItem` +
  `NewsDedupLedger` only, leaves teams/users/packs intact) — this is the one needed by
  `team-readiness-gating`'s rollout step.
- Both scripts log a final per-collection deleted-count summary so a run is auditable after the
  fact.

## Capabilities

### New Capabilities
- `dev-environment-reset`: safety-gated scripts for wiping application data for a clean testing
  slate, and their exact scope (full reset vs. news-only reset).

### Modified Capabilities

_None._

## Impact

- New files: `backend/src/scripts/resetDevData.ts`, `backend/src/scripts/clearNewsItems.ts`.
- `backend/package.json`: two new npm scripts.
- No runtime/production code paths touched — this is operator tooling only, never invoked by the
  server itself.
- **This proposal does not authorize running either script against the live database.** Running
  them (especially the full reset) against the shared Atlas cluster referenced in `backend/.env`
  is a live, irreversible data-loss action and requires the user's explicit go-ahead each time,
  separate from approving this change's code.
