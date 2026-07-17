## 1. Schema

- [x] 1.1 Add to `newsItem.interface.ts` + `newsItem.model.ts`: `engagement_history?: { at: Date; points: number; comments: number; stars_delta: number }[]`, `engagement_refreshed_at?: Date`, `source_removed: { type: Boolean, default: false }`

## 2. Config

- [x] 2.1 envSchema: `NEWS_REFRESH_CRON` default `'30 * * * *'`, `NEWS_REFRESH_WINDOW_HOURS` default `'96'`, `NEWS_REFRESH_MAX_REQUESTS` default `'200'`; export under `news_ingestion.refresh: { cron, window_hours, max_requests }`; document all three in `.env.example`

## 3. MaintenanceRun model

- [x] 3.1 `backend/src/app/modules/MaintenanceRun/`: interface + model (`job: { type: String, enum: ['engagement_refresh', 'retention'] }`, started_at/finished_at/duration_ms, `counts` numeric subdoc, optional `error`); TTL index `{ started_at: 1 }, { expireAfterSeconds: 2592000 }`; collection name `maintenance_runs`

## 4. Refresh service

- [x] 4.1 Export `getAppToken` from `adapters/reddit.ts` (rename nothing else)
- [x] 4.2 `newsRefresh.fetchers.ts`: `ENGAGEMENT_FETCHERS` registry with the three seed fetchers — HN per-item, Reddit (t3_ prefixing, 100-chunk, token via getAppToken, map by `data.name`, credential-gated skip), dev.to per-item; each returns records incl. `removed` + `requests_used`; per-call catch → logged skip; export the registry and `REFRESHABLE_SOURCES = Object.keys(ENGAGEMENT_FETCHERS)`
- [x] 4.3 `newsRefresh.service.ts` `runEngagementRefresh()`: Redis lock (`lock:news_refresh`, PX 55min, NX → skip if held); candidate query `{ created_at: { $gte: windowCutoff }, source: { $in: REFRESHABLE_SOURCES } }` sorted `created_at: -1`, projected `_id source source_id engagement`; budget walk (decrement by each fetcher's reported `requests_used`); bulk updates: `$set` engagement + engagement_refreshed_at, `$push: { engagement_history: { $each: [snapshot], $slice: -32 } }`; first-touch: prepend ingest-time snapshot; 404/removed → `$set: { source_removed: true }`; persist MaintenanceRun in try/catch
- [x] 4.4 `scheduler.ts`: `startEngagementRefreshScheduler` (copy the existing pattern verbatim); call it next to the other `startXScheduler` calls at the server bootstrap call site

## 5. Tests

- [x] 5.1 Unit: reddit fullname prefixing + 100-chunking + response mapped by `data.name` not order
- [x] 5.2 Unit: budget cap stops requests; youngest-first ordering
- [x] 5.3 Integration: refresh updates engagement + history (with $slice cap) + engagement_refreshed_at; 404 sets source_removed without delete; run doc persisted; lock held → no-op

## 6. Verification

- [x] 6.1 `cd backend && npm run build` passes; server boots with no NEWS_REFRESH_* vars set
- [x] 6.2 Ingest (manual trigger), wait for/trigger a refresh run: HN/dev.to items show `engagement_refreshed_at` + ≥2 history snapshots (ingest snapshot + refresh); reddit too if credentials configured
- [x] 6.3 `db.maintenance_runs.find()` shows the run with sane counts and the TTL index exists
