## 1. IngestionRun model

- [x] 1.1 Create `backend/src/app/modules/IngestionRun/ingestionRun.interface.ts` defining `ISourceRunCount { source, fetched, fresh_dropped, hash_deduped, semantic_deduped, relevance_dropped, stored, error? }` and `IIngestionRun { started_at, finished_at, duration_ms, trigger: 'cron' | 'manual', total_stored, sources: ISourceRunCount[], error? }`
- [x] 1.2 Create `backend/src/app/modules/IngestionRun/ingestionRun.model.ts` (mongoose schema matching the interface) with a TTL index: `schema.index({ started_at: 1 }, { expireAfterSeconds: 2592000 })` — collection name is `ingestion_runs` (snake_case, matching the `news_items` convention), not the mongoose-default `ingestionruns`

## 2. Pipeline instrumentation

- [x] 2.1 In `newsIngestion.service.ts`, add `const dedupedCounts = countBySource(deduped)` immediately after the `deduped` array is computed (Layer 2b)
- [x] 2.2 Change `runIngestionPipeline` signature to `runIngestionPipeline(trigger: 'cron' | 'manual'): Promise<IngestionSummary>`
- [x] 2.3 Wrap the full pipeline body so that on an uncaught error, a partial `IngestionRun` document is still built and persisted, then the original error is re-thrown. **Implementation refinement found while writing this**: layers not yet reached at abort time are passed as `undefined` (not `{}`) to `buildSourceRunCounts`, and each layer's item count cascades forward from the last completed layer rather than defaulting to 0 — `{}` would have meant "this layer ran and dropped 100% of items," which is false and would misrepresent a crash as a total loss. See `buildSourceRunCounts`'s doc comment and its dedicated unit tests.
- [x] 2.4 On the success path, build the full `sources` array per source (union of adapter names + all item labels, reusing `unionSourceKeys` from `news-source-quick-wins`) with all six counts, and persist the `IngestionRun` document; persistence itself is wrapped in its own try/catch + `logger.error`
- [x] 2.5 Update `backend/src/app/modules/NewsIngestion/newsIngestion.controller.ts` to call `runIngestionPipeline('manual')`
- [x] 2.6 Update `backend/src/app/lib/scheduler.ts` to call `runIngestionPipeline('cron')`
- [x] 2.7 Unit test: a thrown error during Layer 2b still results in a persisted run document with the layers-completed-so-far counts and a top-level error, and the original error still propagates to the caller — `newsIngestion.runObservability.test.ts`
- [x] 2.8 Unit test: a successful run's per-source counts sum consistently (fetched = fresh_dropped + hash_deduped + semantic_deduped + relevance_dropped + stored) — same file
- [x] 2.9 Unit test: `IngestionRun.create` throwing does not change the pipeline's resolved value or thrown error (covered for both the success path and the crash path) — same file

## 3. Admin endpoint

- [x] 3.1 `ingestionRun.service.ts`: `listRuns(limit: number): Promise<IIngestionRun[]>` — `IngestionRun.find().sort({ started_at: -1 }).limit(...)`, clamped to [1, 100]
- [x] 3.2 `ingestionRun.service.ts`: `computeZeroStreaks(runs): SourceHealth[]` — walks newest-first per source, `alert = zero_streak >= 3`
- [x] 3.3 `ingestionRun.controller.ts`: `GET` handler parsing `?limit=` (default 20), returning `{ runs, sourceHealth }`
- [x] 3.4 In `backend/src/app/modules/NewsItem/newsItem.route.ts`, registered `router.get('/ingestion-runs', ...)` directly after `POST /ingest`, above every `/:id` route
- [x] 3.5 Unit test: `computeZeroStreaks` — 3 consecutive zero-fetch runs → `alert: true`; a non-zero run breaks the streak; below-threshold → `alert: false`; a source absent from a run counts as fetched:0; recovery resets to 0 — `ingestionRun.service.test.ts` (5 cases)
- [x] 3.6 Integration test (supertest, following `newsItem.integration.test.ts` conventions): unauthenticated → 401; non-admin → 403; admin gets `{ runs, sourceHealth }`; `?limit=500` clamped to 100 documents — `ingestionRun.integration.test.ts`

## 4. Admin UI

- [x] 4.1 `frontend/src/lib/api/ingestionRuns.ts` — `getIngestionRuns(limit)`; types added to `frontend/src/lib/api/types.ts` (`IngestionRun`, `IngestionRunSourceCount`, `SourceHealth`, `IngestionRunHistory`)
- [x] 4.2 `frontend/src/pages/dashboard/Admin.tsx` rebuilt (was a "Coming soon" stub, like every other dashboard page in this repo) with two `glass-card` sections: a source-health summary with amber alert chips, and a run-history table (started/trigger/stored/per-source fetched→stored chips/error) in a horizontally-scrollable container for narrow viewports. Uses `useQuery` + the existing `apiGet` client convention (`react-query` was already wired at the app level but no page used it yet).

## 5. Verification

- [x] 5.1 `cd backend && npm run build` passes; `npx tsc --noEmit` clean; `cd frontend && npx tsc -b` clean; eslint clean on every touched file (both projects); `npm test` — 69/69 passing (61 pre-existing/from `news-source-quick-wins` + 8 new pipeline tests + 5 zero-streak tests + 4 endpoint tests). One integration run hit an intermittent `mongodb-memory-server` startup flake (`fassert() failure`) reproduced even on an untouched, previously-passing test file — traced to the host disk being at 97% capacity, not this change's code; retrying resolved it every time.
- [x] 5.2 **Verified live**, not just with mocks: restarted the project's `docker-compose` backend (bind-mounted, so it picked up this change's code) and called `POST /api/v1/news-items/ingest` against the real dev DB. It hit the exact pre-existing `embeddings.ts` crash documented in `news-source-quick-wins` — and this time an `IngestionRun` document *was* persisted, with real per-source counts for every layer reached (e.g. hackernews: fetched 30, fresh_dropped 6, hash_deduped 22, semantic_deduped 0 — correctly 0, not fabricated, since Layer 2b is exactly where it crashed) and `error: "Cannot read properties of undefined (reading '0')"` at the top level.
- [x] 5.3 **Verified live with real data, not a synthetic dead source**: Reddit is already naturally dead (the pre-existing 403 documented in `news-source-quick-wins`/the master doc, not yet fixed — that's `reddit-oauth-adapter`, a separate change). Triggered 3 consecutive real runs; `GET /news-items/ingestion-runs` returned `{"source":"reddit","zero_streak":3,"alert":true}`.
- [x] 5.4 **Verified live**: `db.ingestion_runs.getIndexes()` (via `docker exec` into the running backend) shows `{ key: { started_at: 1 }, expireAfterSeconds: 2592000 }`. Note the collection is `ingestion_runs`, not `ingestionruns` as originally written in this task — corrected here.
- [~] 5.5 **Partially verified — flagging the gap rather than claiming full success.** Confirmed: `npx tsc -b` clean, eslint clean, and Vite's dev-server transform endpoint returns 200 (not a 500 with a stack trace) for both `Admin.tsx` and `ingestionRuns.ts`, meaning there's no syntax/import error. **Not verified: the actual rendered page.** This environment has no browser/screenshot tool available, so the run-history table's visual layout, the amber alert badge's appearance, and dark/light-mode/375px-responsive behavior were never actually seen rendered. The backend has real seeded data ready (including the reddit alert from 5.3) — run `cd frontend && npm run dev` and open `/dashboard/admin` while logged in as the seeded super admin to check this by eye.
