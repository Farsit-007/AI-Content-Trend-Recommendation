## Context

`news_items` engagement (`points`, `comments`, `stars_delta`) and `trend_score` are written once by the ingestion pipeline (`newsIngestion.service.ts:229-251`) and never refreshed. There is no TTL, cleanup cron, or bulk delete anywhere in the codebase (`newsItem.model.ts`, `scheduler.ts` — three jobs today: ingestion, analytics, auto-generation). This change is the first of a four-part plan (`engagement-refresh-job` → `trend-decay-scoring` → `dedup-tombstone-ledger` → `news-retention-lifecycle`); it exists purely to start collecting the engagement time-series that every later "is this still trending?" decision depends on.

Constraints already established by the codebase and carried forward:
- `IngestionRun` (30-day TTL) is the established pattern for self-cleaning scheduled-job history — this change adds a sibling collection rather than overloading it.
- Reddit adapter is OAuth (client-credentials, token cached in Redis under `reddit:app_token`); `getAppToken` is currently module-private.
- HN adapter `source_id = String(item.id)`, re-fetch via `https://hacker-news.firebaseio.com/v0/item/{id}.json`. dev.to adapter `source_id = String(article.id)`, re-fetch via `https://dev.to/api/articles/{id}`.
- `github_trending` scrape-path items have `published_at: undefined` and no cheap per-item re-fetch endpoint; `rss:*` sources have no engagement signal at all.
- Config pattern is zod `envSchema` with `.default()`/`.optional()` string values, consumed via `Number(...)` in the exported config object; every new env var must be optional with a safe default so the server boots with none of them set.
- Redis is a hard dependency (ioredis); the lock idiom is `redis.set(key, val, 'PX', ms, 'NX')`.

A follow-on change (`trend-decay-scoring`) is expected to add source registrations to this change's fetcher registry and consume `engagement_history` for velocity — this change must expose an extension point, not a closed list.

## Goals / Non-Goals

**Goals:**
- Re-poll current engagement for stored news items from sources that support cheap per-item re-fetch (hackernews, reddit, devto), on a schedule, without ever touching `trend_score`.
- Build an engagement time-series (`engagement_history`) that later changes can use for velocity/decay computation.
- Detect source-side removal (404/410) as a signal, without acting on it (no deletion in this change).
- Make the set of refreshable sources extensible via a registry so future adapters (lobsters, stackoverflow, producthunt, etc., from a sibling plan) can opt in with zero changes to the job itself.
- Record run history (`maintenance_runs`) for observability, following the existing `IngestionRun` persistence discipline (never fail the job on persistence failure).

**Non-Goals:**
- Computing any decayed/live trend score (`current_trend_score`) — that is `trend-decay-scoring`.
- Deleting, archiving, or otherwise acting on `source_removed` — that is `news-retention-lifecycle`.
- Re-fetching `github_trending` or `rss:*` items — no cheap per-item signal exists; GH's eventual refresh mechanism belongs to a different change's hash-dedup hook.
- Migrating the Reddit adapter or HN-Algolia adapter — only exporting `getAppToken` (no behavior change).

## Decisions

1. **Request budget & prioritization.** The candidate query sorts `created_at: -1` (youngest first — they change fastest and inform the most imminent decisions). HN and dev.to cost 1 request/item; Reddit costs `ceil(n/100)`. Walk candidates youngest-first, decrementing the budget by actual request cost, stopping at the cap. Older items degrade to less-frequent refresh — an acceptable trade-off versus a hard per-item guarantee.
2. **Reddit fullnames.** Stored `source_id` is the bare id; the `/api/info` endpoint needs `t3_`-prefixed fullnames. Build `id=t3_a,t3_b,…` and map the response back to items by stripping the prefix off `data.name` — never rely on response order, since the listing endpoint doesn't guarantee it.
3. **Failure isolation.** Per-source try/catch: one source's failure (e.g., Reddit token failure) must not stop refresh of the others. A single item's fetch failure is logged and skipped, not retried inline. Errors are recorded in the run document's counts, not thrown.
4. **`$slice: -32` snapshot cap.** Hourly cadence over the 96 h window is ~96 potential snapshots; keeping the most recent 32 (~32 h of history) is enough for velocity (the next change needs only the last two data points) while bounding document growth. Tiered/decimated sampling is not worth the complexity.
5. **Why a new `maintenance_runs` collection instead of reusing `ingestion_runs`.** `IngestionRun.trigger` is a closed enum (`['cron','manual']`) and its `sources` array shape is ingestion-layer-specific. Overloading it for a structurally different job would corrupt the existing zero-streak-observability semantics. A sibling collection with the same TTL discipline is strictly cheaper than bending the existing one, and the retention job (later in the plan) reuses this same collection with a different `job` value.
6. **Redis lock.** `redis.set('lock:news_refresh', runId, 'PX', 55*60*1000, 'NX')`; if not acquired, log and return without side effects. Release is expire-only (no compare-and-delete) — the PX window is shorter than the cron period, which is sufficient here and keeps the lock logic simple.
7. **First-touch backfill snapshot.** On an item's first refresh touch, the job also prepends the ingest-time engagement as `engagement_history[0]` (derived from the already-stored `engagement` field), so velocity is computable after a single refresh cycle instead of requiring two.
8. **Fetcher-registry contract.** `newsRefresh.fetchers.ts` exports `type EngagementFetcher = (items: { _id; source_id }[]) => Promise<{ source_id; points; comments; stars_delta; removed; requests_used }[]>` and `ENGAGEMENT_FETCHERS: Record<string, EngagementFetcher>`. Each fetcher owns its own batching strategy and reports its actual request cost so the budget walk stays accurate across differently-priced sources. `Object.keys(ENGAGEMENT_FETCHERS)` is exported as `REFRESHABLE_SOURCES` and is the single source of truth for "does this source support refresh" — later changes (score computation, retention's archive-floor guard) import this list rather than repeating a literal source name array, so registering a new source anywhere never requires touching this job or those consumers.

## Risks / Trade-offs

- **[Risk] Reddit token/API failures silently degrade refresh coverage.** → Mitigation: per-source try/catch with errors recorded in `maintenance_runs.counts.errors`/`error`; HN/dev.to refresh continues unaffected; credential-gated skip (logged) when `REDDIT_CLIENT_ID`/`SECRET` unset, so the job never crashes for a missing optional integration.
- **[Risk] Unbounded document growth from `engagement_history` on long-lived items.** → Mitigation: `$slice: -32` bound enforced on every push; the 96 h refresh window means very old items simply stop being touched.
- **[Risk] Concurrent job instances double-refreshing or racing writes.** → Mitigation: Redis lock (`lock:news_refresh`, PX, NX) around the whole job body, per global convention for all scheduled jobs in this plan.
- **[Risk] `source_removed: true` being mistaken elsewhere as a delete signal before the retention change ships.** → Mitigation: explicitly scoped as "SHALL NOT delete" in the spec; the field's only consumer is a later change.
- **[Trade-off] Older items (near the 96 h edge) get refreshed less reliably than younger ones under the request cap.** Accepted — the same items are the least actionable, and the plan's own defaults comfortably cover the current volume with headroom.

## Migration Plan

- All three new env vars are optional with defaults; no `.env` changes required to deploy. Server must boot with none of them set.
- Schema additions (`engagement_history`, `engagement_refreshed_at`, `source_removed`) are additive and optional — no migration/backfill needed for existing rows; `source_removed` defaults `false`.
- New collections (`maintenance_runs`) are created implicitly by Mongoose on first write; TTL index is declared on the schema.
- Rollback: disabling the scheduler call site (or unregistering the job) reverts to current frozen-engagement behavior with no data loss — no stored data becomes invalid if the job stops running.

## Open Questions

None — scope, defaults, and extension points are fixed by the parent plan (`2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md`, Change R1).
