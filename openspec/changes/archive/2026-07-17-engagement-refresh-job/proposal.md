## Why

An item's engagement (`points`, `comments`, `stars_delta`) and `trend_score` are written once at ingest (`newsIngestion.service.ts:229-251`) and never touched again. An item that exploded an hour after ingestion and an item that died immediately are indistinguishable forever, which makes the reported requirement — "delete immediately when out of trend" — impossible: there is no trend signal to act on. HN, Reddit, and dev.to all support cheap re-fetch by the `source_id` we already store; re-polling them on a schedule creates the engagement time-series every later retention decision depends on.

## What Changes

- New scheduled job `runEngagementRefresh` (own cron, default `NEWS_REFRESH_CRON=30 * * * *`, Redis-locked, following the existing `scheduler.ts` pattern).
- Scope per run: items with `created_at` within the last `NEWS_REFRESH_WINDOW_HOURS` (default 96) from sources with a registered engagement fetcher, youngest first, capped at `NEWS_REFRESH_MAX_REQUESTS` (default 200) HTTP requests per run.
- Per-source fetchers live in an extensible registry `ENGAGEMENT_FETCHERS: Record<string, EngagementFetcher>`, seeded with `hackernews`, `reddit`, `devto`. `github_trending` and `rss:*` are never registered (no re-fetch signal / owned by a different future change).
- Per item refreshed: overwrite stored engagement counts, append a bounded (`$slice: -32`) timestamped snapshot to new `engagement_history`, set `engagement_refreshed_at`. `trend_score` (the ingest-time snapshot) is never modified by refresh.
- A 404/410 (or source-reported removal) on re-fetch sets new field `source_removed: true`. The item is never deleted on removal detection — that is a signal consumed by a later retention change, not an action this change takes.
- New `maintenance_runs` collection (30-day TTL, mirroring `IngestionRun`'s shape) persists one document per refresh run with timings and counts. Persistence failure never fails the job.
- Reddit adapter's `getAppToken` becomes exported (no behavior change) so the refresh job can reuse the cached OAuth app token.

## Capabilities

### New Capabilities
- `engagement-refresh`: scheduled re-polling of stored news items' engagement from sources that support cheap re-fetch, source-removal detection, and refresh-run history.

### Modified Capabilities
(none — `openspec/specs/` has no existing capabilities yet; `engagement-refresh` is introduced fresh by this change)

## Impact

- New: `backend/src/app/modules/NewsRefresh/` (`newsRefresh.service.ts`, `newsRefresh.fetchers.ts`), `backend/src/app/modules/MaintenanceRun/` (`maintenanceRun.interface.ts`, `maintenanceRun.model.ts`).
- `backend/src/app/modules/NewsItem/newsItem.model.ts` + `newsItem.interface.ts` — new optional fields `engagement_history`, `engagement_refreshed_at`, `source_removed` (default `false`).
- `backend/src/app/modules/NewsIngestion/adapters/reddit.ts` — export `getAppToken`.
- `backend/src/app/lib/scheduler.ts` — new `startEngagementRefreshScheduler`, wired at the existing bootstrap call site.
- `backend/src/app/config/index.ts` + `backend/.env.example` — `NEWS_REFRESH_CRON`, `NEWS_REFRESH_WINDOW_HOURS`, `NEWS_REFRESH_MAX_REQUESTS`.

**Out of scope for this change** (belongs to later changes in the same plan): `current_trend_score` / decay scoring, the dedup tombstone ledger, archive/hard-delete lifecycle jobs, story chains, and the `github_trending` same-URL engagement-refresh hook at hash-dedup.
