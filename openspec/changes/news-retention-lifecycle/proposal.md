## Why

`news_items` grows monotonically — nothing deletes from it today except a manual per-item admin action, and every feed query, semantic-dedup pool, and report scan pays the cost of that growth forever. With engagement re-polling (`engagement-refresh-job`), a decayed live trend score (`trend-decay-scoring`), and a tombstone ledger (`dedup-tombstone-ledger`) now in place, a two-stage lifecycle — reversible archive at 3–4 days or on trend collapse, hard delete with cascade after a cooling-off window — is safe to ship. This is the change that actually satisfies the reported requirement: "delete old / out-of-trend news within 3–4 days to keep the DB clean."

## What Changes

- **Lifecycle fields on `news_items`:** `lifecycle: 'active' | 'archived'` (default `active`, indexed), `archived_at?: Date`, `archive_reason?: 'max_age' | 'trend_floor' | 'source_removed'`.
- **New scheduled job `runNewsRetention`** (own cron, Redis-locked), persisting a `maintenance_runs` document (`job: 'retention'`) per run, starting with an idempotent backfill of the new `lifecycle` field.
- **Stage 1 — archive (`active → archived`), capped per run.** Archive when: `created_at` exceeds the max-age ceiling (default 96h — the "3–4 days" ceiling), OR `created_at` exceeds a minimum age (default 36h) AND `current_trend_score` is below a configurable floor AND the item has an engagement signal (so engagement-less sources like RSS aren't archived purely for having a permanent score of 0), OR `source_removed` is true (any age). Protected from archival: items with a recent category override, or `needs_review` items younger than 7 days.
- **Stage 2 — hard delete (`archived → gone`), batched.** Items archived longer than a cooling-off window (default 14 days) are deleted per batch in order: tombstone insertion (via the existing `recordTombstones`) → category-override cleanup → item deletion.
- **Archived items leave all product surfaces:** feed default listing, report opportunity candidates, chat news-context pooling, auto-generation candidate selection, and the ingestion semantic-dedup embedding pool all exclude `lifecycle: 'archived'` items. Fetch-by-id still resolves them (old generated content keeps linking correctly); an explicit `?lifecycle=archived` feed query is the admin escape hatch.
- **Restore path:** `PATCH /news-items/:id { "lifecycle": "active" }` on the existing admin update route, clearing `archived_at`/`archive_reason`.
- **The engagement-refresh job's candidate scope excludes archived items.**
- **Admin observability:** `GET /news-items/maintenance-runs` (optional `job` filter) plus a retention-runs table on the Admin dashboard, alongside the existing ingestion-runs table.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-retention`: adds lifecycle state, the two-stage archive/delete job, and surface-exclusion requirements to the capability introduced by `dedup-tombstone-ledger` (tombstone ledger requirement). That change is not yet archived/synced, so this delta restates the ledger requirement's neighbors as full text per the established convention — it does not modify the ledger requirement itself.
- `engagement-refresh`: the refresh job's candidate query gains a `lifecycle != archived` scope exclusion — a one-clause addition to the requirement introduced by `engagement-refresh-job` and touched again by `trend-decay-scoring` (also not yet archived/synced).

## Impact

- `backend/src/app/modules/NewsItem/` — `newsItem.model.ts`/`newsItem.interface.ts` (lifecycle fields), `newsItem.validation.ts` (`lifecycle` in both update and list-query schemas), `newsItem.service.ts` (`getAllNewsItems` default-excludes archived; `updateNewsItem` clears archive fields on restore), `newsItem.route.ts` (new `GET /news-items/maintenance-runs`, registered above `/:id`).
- New: `backend/src/app/modules/NewsRetention/newsRetention.service.ts` (`runNewsRetention`).
- `backend/src/app/modules/MaintenanceRun/` — `counts` schema loosened from a job-specific sub-schema to `Schema.Types.Mixed` so the same collection can hold both jobs' differently-shaped count summaries (existing `engagement_refresh` documents and reads are unaffected); new controller for the `maintenance-runs` list endpoint.
- `backend/src/app/lib/scheduler.ts` — `startNewsRetentionScheduler`, wired at the bootstrap call site.
- `backend/src/app/modules/NewsRefresh/newsRefresh.service.ts` — candidate query gains the lifecycle exclusion.
- `backend/src/app/modules/Report/report.opportunities.ts`, `backend/src/app/modules/Chat/chat.retrieval.ts`, `backend/src/app/modules/GeneratedContent/generatedContent.job.ts`, `backend/src/app/modules/NewsIngestion/newsIngestion.utils.ts` (`fetchRecentEmbeddings`) — all gain the same lifecycle exclusion.
- `backend/src/app/config/index.ts` + `backend/.env.example` — `NEWS_RETENTION_CRON`, `NEWS_ARCHIVE_MAX_AGE_HOURS`, `NEWS_ARCHIVE_MIN_AGE_HOURS`, `NEWS_ARCHIVE_TREND_FLOOR`, `NEWS_DELETE_AFTER_DAYS`.
- `frontend/src/lib/api/` — `maintenanceRuns.ts` client fn + types; `frontend/src/pages/dashboard/Admin.tsx` — retention-runs table beside the existing ingestion-runs table.

**Out of scope for this change** (belongs to a later plan, per §0.3.B of the parent plan document): story-chain (`story_id`) archive protection and whole-story archival — that arrives with a future dedup-updates change and is designed to slot in as one additional protection clause, per this change's guard-clause query structure (design decision 8). Also out of scope: any `$vectorSearch` migration (chat retrieval stays a plain `find()` + in-app cosine, unaffected by this change beyond the added filter) and any frontend change to the feed page itself (it still reads from `src/lib/mock/`, not the real API — the "fetch-by-id 404 tolerance" verification step from the parent plan doesn't apply here for the same reason).
