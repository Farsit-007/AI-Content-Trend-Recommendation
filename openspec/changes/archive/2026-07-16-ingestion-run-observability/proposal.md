## Why

Every layer of the news ingestion pipeline drops items silently. Adapter failures, freshness drops, hash-dedup drops, semantic drops, and relevance drops are at best a pino log line — there is no persisted run history, no per-source health signal, and no alerting. This is why Reddit was able to return HTTP 403 (unauthenticated scripted access is blocked) for an unknown length of time before anyone noticed: the pipeline just kept reporting a summary in an HTTP response nobody was watching, and the next run's `IngestionSummary` overwrote all evidence of the last one.

This is the named prerequisite for the rest of the news-source remediation roadmap. The Reddit OAuth fix and the GitHub Trending hardening (both planned as separate changes) need a way to prove, after shipping, that the source actually recovered — and to prove it stays recovered instead of silently dying again next week. Without persisted history, "it worked when I tested it" is the only evidence available, which is exactly the blind spot that let Reddit rot silently in the first place.

## What Changes

- **New `IngestionRun` collection.** One document persisted per pipeline run — cron or manual — recording start/finish timestamps, duration, trigger type, and per-source counts for every pipeline layer (`fetched`, `fresh_dropped`, `hash_deduped`, `semantic_deduped`, `relevance_dropped`, `stored`), plus any per-source error string. Expires after 30 days via a TTL index so the collection self-cleans.
- **Persistence lives inside `runIngestionPipeline()`** so both the cron scheduler and the manual `POST /news-items/ingest` endpoint are covered by the same code path. A failure to persist the run document must never fail or roll back the ingestion itself — the pipeline's actual work (fetching, storing items) is unaffected either way.
- **New per-source layer count: `semantic_deduped`.** The pipeline currently computes `fetched`, `fresh` (survives freshness), `unique` (survives hash-dedup), and `relevant` (survives relevance) counts per source, but never counts what semantic dedup removes per source — that gap has to close for the run document's layer breakdown to be complete.
- **New admin endpoint** `GET /news-items/ingestion-runs` returning the most recent runs (default 20, capped at 100) plus, per source, a `zero_streak` — the count of consecutive most-recent runs where that source fetched 0 items — with `alert: true` at streak ≥ 3. Computed at read time from the persisted run history; no separate alert-state table.
- **Admin dashboard surface**: the existing Admin page gains a run-history table and a visible badge for alerting sources, so "Reddit has been dead for a week" becomes something a human sees without grepping logs.

## Capabilities

### New Capabilities
- `ingestion-observability`: persisted per-run, per-source, per-layer ingestion history (including the previously-uncounted semantic-dedup layer) and the admin-facing zero-streak alerting endpoint built on top of it. This is purely additive — it does not change the existing `POST /news-items/ingest` response contract or any other `news-ingestion` behavior; the new per-layer counting exists only to populate the persisted run document.

### Modified Capabilities
<!-- None. news-ingestion's existing requirements (Source Adapters, Manual Ingestion Trigger, Scheduled Ingestion, etc.) are unchanged; this change observes the pipeline from the outside and persists what it sees. -->

## Impact

**New code:**
- `backend/src/app/modules/IngestionRun/` — `ingestionRun.interface.ts`, `ingestionRun.model.ts` (schema + TTL index), `ingestionRun.service.ts` (list + zero-streak computation), `ingestionRun.controller.ts`.

**Modified code:**
- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts` — add a `countBySource(deduped)` call for the semantic-dedup layer, accept a `trigger: 'cron' | 'manual'` parameter, assemble and persist the run document around the existing pipeline logic.
- `backend/src/app/modules/NewsIngestion/newsIngestion.controller.ts` — pass `trigger: 'manual'`.
- `backend/src/app/lib/scheduler.ts` — pass `trigger: 'cron'`.
- `backend/src/app/modules/NewsItem/newsItem.route.ts` — new `GET /ingestion-runs` route, registered above any `/:id` route to avoid shadowing.
- `frontend/src/lib/api/` — client function for the new endpoint.
- `frontend/src/pages/dashboard/Admin.tsx` — run-history table + zero-streak alert badge.

**Explicitly unaffected:**
- The existing `IngestionSummary` HTTP response shape from `POST /news-items/ingest` — the run document is a persisted superset, not a replacement.
- `content_hash` semantics, the semantic-dedup threshold, retention/TTL on `news_items` itself — out of scope, tracked by sibling changes in the roadmap.

**Known dependency risk (discovered live during the prerequisite change):** this change's own definition of done requires triggering multiple ingestion runs and observing them accumulate in run history — including a controlled zero-streak test. A pre-existing bug in `backend/src/app/lib/embeddings.ts` (unrelated to ingestion sources, not touched by the `news-source-quick-wins` change that surfaced it) currently makes `POST /news-items/ingest` fail with HTTP 500 partway through Layer 2b whenever real fetched content is embedded in volume, before the pipeline reaches the point where a run document would be written. If that bug is still unresolved when this change is applied, verification tasks that require a completed end-to-end run will be blocked the same way — this proposal does not fix that bug (it is out of scope here too), but implementation should account for it: the run-document write must happen in a `finally`-equivalent path that captures a run even when the pipeline later throws inside Layer 2b/3/4, or verification will be blocked twice over.
