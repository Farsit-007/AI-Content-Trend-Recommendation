## Context

`runIngestionPipeline()` (`backend/src/app/modules/NewsIngestion/newsIngestion.service.ts`) runs four layers — fetch/normalize, hash-dedup + freshness, semantic dedup, relevance/trend + categorize/store — and returns an in-memory `IngestionSummary` that only the HTTP caller of `POST /news-items/ingest` ever sees. The 3-hourly cron (`backend/src/app/lib/scheduler.ts:13-24`) discards the summary into a log line. Nothing is persisted.

The `news-source-quick-wins` change (applied immediately before this one) fixed RSS/Medium/dev.to fetch behavior and, in doing so, surfaced a real, live example of exactly the blind spot this capability exists to close: `POST /news-items/ingest` now throws an uncaught `TypeError` inside `backend/src/app/lib/embeddings.ts:10` partway through Layer 2b whenever real fetched content is embedded in volume. That bug is out of scope for this change (it lives in `embeddings.ts`, not ingestion source code), but its existence is direct evidence for a design requirement below: **a pipeline that crashes must still leave a record**, or this capability fails at the one moment it matters most.

Verified current state:

| Fact | Location |
|---|---|
| `runIngestionPipeline()` computes `fetchedCounts`, `freshCounts`, `uniqueCounts`, `relevantCounts` per source via `countBySource`, but never counts the semantic-dedup layer's removals per source | `newsIngestion.service.ts` (post `news-source-quick-wins`) |
| `AdapterResult` already carries `{ source, items, error? }` — the per-source error string this capability needs already exists at Layer 1 | `newsIngestion.interface.ts` |
| `runAllAdapters()` catches per-adapter failures and never lets one adapter's failure abort the others | `adapters/index.ts:17-30` |
| No code anywhere calls `.create()` on anything under a name resembling `IngestionRun` — confirmed by grep | — |
| `newsItem.route.ts` mounts `POST /ingest` and item CRUD; any new route must be checked against `/:id`-shaped routes for ordering | `newsItem.route.ts` |
| Redis is a hard dependency already (`app/lib/redis.ts`), Mongo/mongoose is the persistence layer for every other collection (`NewsItem`, `Team`, etc.) | — |
| `backend/src/app/lib/embeddings.ts:10` throws when `response.data` is undefined — an unhandled rejection that currently propagates all the way up through `runIngestionPipeline()` and out to the Express error handler as an HTTP 500, with nothing written anywhere | Live-reproduced during `news-source-quick-wins` verification |

## Goals / Non-Goals

**Goals:**
- Every ingestion run — cron or manual, successful or crashed — leaves a persisted, queryable record.
- Per-source, per-layer counts are complete (the semantic-dedup gap closes).
- An admin can see, without reading logs, which sources have been silently dead for N consecutive runs.
- Run persistence never becomes a new way for the pipeline to fail (a broken write must not break ingestion, and a broken pipeline must not prevent a write).

**Non-Goals:**
- Fixing the `embeddings.ts` bug that currently blocks end-to-end runs. That bug is orthogonal (it's in the embedding client, not ingestion sources) and belongs to whoever owns LLM/embedding call robustness. This change treats it as an environmental fact to design around, not a target to fix.
- Real-time alerting (Slack, email, push). "Alert" here means a boolean surfaced in an API response and a badge in the admin UI — nothing pushes notifications yet.
- Retention/TTL on `news_items` itself, or any change to `content_hash`/dedup semantics — tracked by sibling changes.
- Per-source counts for the manual endpoint's *returned* `IngestionSummary` shape — that contract (fixed by `news-source-quick-wins`) is unchanged; this change adds a parallel persisted record, not a new response shape.

## Decisions

### 1. Run persistence must survive a mid-pipeline throw, not just the happy path

The originally sketched approach (persist after `insertMany`, in a try/catch around only the save call) silently fails the one scenario this capability is built for: if `runIngestionPipeline()` throws before reaching that point — which it demonstrably does today, inside Layer 2b — no run document is ever written, and the admin endpoint shows nothing for that run. A gap in the run history is indistinguishable from "the cron didn't fire," which is the exact ambiguity this change eliminates for *sources*; it must not reintroduce the same ambiguity for *runs*.

Fix: wrap the entire pipeline body in a top-level `try { ... } catch (err) { ... } finally { persist }`, or equivalently persist in a `finally`-shaped block that runs whether the body succeeded or threw. Track counts incrementally as each layer completes (already true — `fetchedCounts`, `freshCounts`, etc. are computed layer-by-layer) so that if the pipeline dies mid-way, the run document still captures every layer that *did* complete, a top-level `error` field for the uncaught exception, and `finished_at`/`duration_ms` measured up to the crash. Re-throw after persisting, so the HTTP caller still gets its 500 — this change does not change error-response behavior, only adds a side-effect that survives it.

*Alternative considered:* only persist on success, treat a thrown pipeline as "no run to record." Rejected — this is precisely the blind spot from the Why section, now proven live rather than hypothetical.

### 2. Semantic-dedup per-source counts: compute once, reuse the existing pattern

`newsIngestion.service.ts` already calls `countBySource` after every other layer (`fetchedCounts`, `freshCounts`, `uniqueCounts`, `relevantCounts`). Layer 2b (`dedupeSemantic`) produces `deduped` but nothing counts it per source. Add `const dedupedCounts = countBySource(deduped)` immediately after that line — same helper, same shape, zero new abstraction.

`semantic_deduped` per source = `uniqueCounts[source] - dedupedCounts[source]`. This slots into the existing five-layer arithmetic (`fetched → fresh_dropped → hash_deduped → semantic_deduped → relevance_dropped → stored`) the same way `buildSourceSummaries` (from `news-source-quick-wins`) already derives `deduped`/`discarded` from adjacent count maps.

### 3. Trigger threading: a parameter, not global state

`runIngestionPipeline(trigger: 'cron' | 'manual')`. The scheduler passes `'cron'`, the controller passes `'manual'`. No new module-level state, no inference from call stack — the caller always knows which one it is, so it's a plain parameter. This mirrors how `AdapterResult`/`IngestionSummary` are already threaded explicitly through the function rather than inferred.

### 4. Zero-streak computed at read time, not stored

The `GET /ingestion-runs` endpoint walks the last N runs (newest-first) per source and counts a streak of consecutive `fetched === 0` from the most recent run backward, stopping at the first non-zero. No stored "alert" boolean, no cron job to recompute it, no risk of the stored value drifting from the underlying run history. This is deliberately the same "derive from source of truth at read time" choice `news-source-quick-wins` made for `unionSourceKeys` — consistent pattern across this codebase's recent history work.

*Alternative considered:* a scheduled job that recomputes and stores per-source alert state. Rejected — adds a second cron, a second place state can go stale, and the computation is cheap enough (bounded by `limit`, default 20) to do inline on every read.

### 5. TTL index directly on `IngestionRun.started_at`

`{ started_at: 1 }, { expireAfterSeconds: 2592000 }` (30 days). Matches the existing pattern of letting MongoDB expire time-bounded operational data rather than a manual cleanup job — no cron, no admin action, self-cleaning. 30 days comfortably covers the zero-streak window (default `limit: 20` runs at a 3-hourly cadence is ~2.5 days) with headroom for manual runs and debugging further back.

### 6. Route ordering

`GET /news-items/ingestion-runs` must be registered in `newsItem.route.ts` **before** any `/:id`-shaped route, or Express will match `ingestion-runs` as an `:id` param on the item-fetch route and this endpoint will never be reached. `POST /ingest` already exists in this file as a sibling literal route — same pattern, same file, insert near it rather than after the `/:id` routes.

## Risks / Trade-offs

- **The `embeddings.ts` blocker could make this change impossible to verify end-to-end until it's fixed separately** → Mitigated by Decision 1: once persistence survives a mid-pipeline throw, this change's own verification (task list) can prove itself using *crashed* runs as valid, observable data points — a controlled zero-streak test doesn't require a fully successful run, just repeated attempts with recorded outcomes. If that turns out to be insufficient, the fix belongs in a follow-up on `embeddings.ts`, not scope creep into this change.
- **Persisting inside the pipeline function adds a Mongo write to the hot path** → Single `create()` call per run (every 3 hours, or on manual admin trigger); negligible compared to the LLM/embedding calls already in the same function.
- **A broken `IngestionRun.create()` must not break ingestion** → Wrapped in its own try/catch with `logger.error`; the pipeline's actual return value / thrown error is never altered by a persistence failure.
- **30-day TTL could be too short if an operator wants longer historical trend data later** → Acceptable now; this is operational health data, not analytics — if longer retention is needed later, it's a one-line index change, not a migration.
- **`zero_streak` computed at read time over `limit` runs is O(limit × sources)** → Trivial at `limit ≤ 100`; no index pressure beyond the existing `started_at` sort.
