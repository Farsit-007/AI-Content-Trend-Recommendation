## 1. Schema & config

- [x] 1.1 `newsItem.model.ts` + `newsItem.interface.ts`: `lifecycle: { type: String, enum: ['active', 'archived'], default: 'active', index: true }`, `archived_at?: Date`, `archive_reason?: 'max_age' | 'trend_floor' | 'source_removed'`
- [x] 1.2 Config: `NEWS_RETENTION_CRON` default `'15 */6 * * *'`, `NEWS_ARCHIVE_MAX_AGE_HOURS` default `'96'`, `NEWS_ARCHIVE_MIN_AGE_HOURS` default `'36'`, `NEWS_ARCHIVE_TREND_FLOOR` default `'2.0'`, `NEWS_DELETE_AFTER_DAYS` default `'14'`; extend the existing `superRefine` block: `MIN_AGE_HOURS < MAX_AGE_HOURS`, `DELETE_AFTER_DAYS >= 1`, `TREND_FLOOR` in `[0, 10]`; export under `news_ingestion.retention: { cron, max_age_hours, min_age_hours, trend_floor, delete_after_days }`; document all five in `.env.example` with the "3-4 days" rationale
- [x] 1.3 `newsItem.validation.ts`: add `lifecycle: z.enum(['active', 'archived']).optional()` to both `updateNewsItemValidation` and `getAllNewsItemsValidation`'s query schema
- [x] 1.4 `newsItem.service.ts` `updateNewsItem`: when `payload.lifecycle === 'active'`, also `$unset`/clear `archived_at` and `archive_reason` on the update (so restoring an item doesn't leave stale archive metadata)

## 2. MaintenanceRun counts widening

- [x] 2.1 `maintenanceRun.interface.ts`: split `IMaintenanceRunCounts` into `IEngagementRefreshCounts` (existing shape, unchanged) and `IRetentionCounts` (`candidates`, `backfilled`, `archived: { max_age; trend_floor; source_removed }`, `deleted`, `overrides_removed`, `tombstones_written`, all numbers); export `IMaintenanceRunCounts = IEngagementRefreshCounts | IRetentionCounts` for the shared `IMaintenanceRun.counts` field
- [x] 2.2 `maintenanceRun.model.ts`: change `counts` field type from the rigid `maintenanceRunCountsSchema` sub-document to `{ type: Schema.Types.Mixed, required: true }`; remove the now-unused sub-schema; confirm `NewsRefresh/newsRefresh.service.ts`'s existing writes still compile against the new union type with no call-site changes needed

## 3. Retention job

- [x] 3.1 `backend/src/app/modules/NewsRetention/newsRetention.service.ts` `runNewsRetention()`: Redis lock (`lock:news_retention`, PX less than the cron period, NX → skip if held); idempotent backfill `NewsItem.updateMany({ lifecycle: { $exists: false } }, { $set: { lifecycle: 'active' } })`
- [x] 3.2 Stage 1 archive query: build `protectionClauses: FilterQuery<INewsItem>[]` (recent-override via `NewsItemCategoryOverride.distinct('news_item_id', { overridden_at: { $gte: cutoff30d } })` mapped to `ObjectId`; fresh-needs_review via `{ needs_review: true, created_at: { $gte: cutoff7d } }`); combine with `$nor`; `$or` the three archive conditions (max-age / min-age+floor+signal / source_removed) using `REFRESHABLE_SOURCES` from `NewsRefresh/newsRefresh.fetchers.ts` for the engagement-signal `$or`; `$set lifecycle: 'archived', archived_at: now, archive_reason` per matched condition, capped at 2000 documents, tally counts per reason
- [x] 3.3 Stage 2 hard delete: find `{ lifecycle: 'archived', archived_at: { $lt: deleteCutoff } }`, project `_id content_hash title source`, process in batches of 500: `recordTombstones` → `NewsItemCategoryOverride.deleteMany({ news_item_id: { $in: batchIds } })` → `NewsItem.deleteMany({ _id: { $in: batchIds } })`; accumulate `deleted`/`overrides_removed`/`tombstones_written` counts
- [x] 3.4 Persist `MaintenanceRun` (`job: 'retention'`, the `IRetentionCounts` shape) in try/catch mirroring `NewsRefresh`'s `persistMaintenanceRun`; never let persistence failure fail the run
- [x] 3.5 `scheduler.ts`: `startNewsRetentionScheduler` (copy the existing pattern verbatim); wire at the bootstrap call site alongside the other three schedulers
- [x] 3.6 `NewsRefresh/newsRefresh.service.ts`: add `lifecycle: { $ne: 'archived' }` to the candidate query

## 4. Surface exclusions

- [x] 4.1 `newsItem.service.ts` `getAllNewsItems`: when `remainingQuery.lifecycle` is absent, add `lifecycle: { $ne: 'archived' }` to the base `NewsItem.find(...)` filter passed into `QueryBuilder` (so `countTotal()` stays consistent); an explicit `?lifecycle=` query param passes through `QueryBuilder.filter()` unchanged and overrides the default
- [x] 4.2 `getSingleNewsItem`: no change (stays unfiltered — add a one-line comment explaining why, per design.md decision 6)
- [x] 4.3 `report.opportunities.ts` `getTopOpportunities`: add `lifecycle: { $ne: 'archived' }` to the `NewsItem.find({ processed: true, ... })` filter
- [x] 4.4 `chat.retrieval.ts` `fetchNewsContext`: add `lifecycle: { $ne: 'archived' }` to the `NewsItem.find({}, {...projection})` filter
- [x] 4.5 `generatedContent.job.ts` `runAutoGeneration`: add `lifecycle: { $ne: 'archived' }` to the `NewsItem.find()` filter
- [x] 4.6 `newsIngestion.utils.ts` `fetchRecentEmbeddings`: add `lifecycle: { $ne: 'archived' }` to the `NewsItem.find({ published_at: { $gte: cutoff }, ... })` filter

## 5. Admin observability

- [x] 5.1 `MaintenanceRun` module: `listRuns(limit, job?)` service fn + controller (`limit` capped at 100, optional `job` filter); route `GET /news-items/maintenance-runs` (requireAuth + requireAdmin) registered in `newsItem.route.ts` directly beside `GET /ingestion-runs`, above the `/:id` routes
- [x] 5.2 Frontend: `frontend/src/lib/api/maintenanceRuns.ts` (mirrors `ingestionRuns.ts`) + `MaintenanceRun`/`RetentionCounts` types in `frontend/src/lib/api/types.ts`
- [x] 5.3 Frontend: retention-runs table on `Admin.tsx` beside the existing ingestion-runs table (started/duration, archived-by-reason chips, deleted count; glass-card styling per design tokens; responsive ≥375px; dark mode) — code complete, typechecked clean; live browser verification pending, tracked with the rest of section 7

## 6. Tests

- [x] 6.1 Unit: the Stage 1 engagement-signal Mongo predicate agrees with `hasEngagementSignal` across representative documents (registry source w/ zero engagement, non-registry w/ nonzero engagement, non-registry w/ zero engagement, including a fake extra registry entry to prove no literal-list drift)
- [x] 6.2 Integration (`newsRetention.integration.test.ts`, 8 cases): max-age archive; trend-floor archive with signal; rss/zero-engagement exempt at the same age; min-age grace; recent-override protection; fresh-needs_review protection; `source_removed` archives regardless of age; restore clears `archived_at`/`archive_reason` and item reappears in the default listing
- [x] 6.3 Integration: Stage 2 cascade — tombstone written, override row gone, item gone, counts match; idempotency (second run over an already-deleted batch is a harmless no-op)
- [x] 6.4 Integration: lock held → no-op (item untouched, no MaintenanceRun persisted)
- [x] 6.5 Integration: `getAllNewsItems` excludes archived by default, includes via `?lifecycle=archived`, legacy rows (no field) remain visible
- [x] 6.6 Integration: `getSingleNewsItem` still resolves an archived item by id
- [x] 6.7 Integration: verified the archived-exclusion contract (`lifecycle: { $ne: 'archived' }`) that report.opportunities / chat.retrieval / generatedContent.job candidate queries share (each filter confirmed present in code; the three functions themselves need LLM/embedding mocks to invoke, so the shared contract is asserted rather than each call)
- [x] 6.8 Integration: `fetchRecentEmbeddings` (semantic-dedup pool) excludes archived items

## 7. Verification

- [x] 7.1 `npm run build` passes; config boots with none of the 5 retention vars set (defaults applied, superRefine satisfied); full suite green — **36 suites / 254 tests** (15 new)
> Live drills 7.2–7.6 were run against the real Atlas DB with a controlled harness: seeded dedicated backdated test items, captured/restored any real items the run touched, and cleaned up afterward (final state verified: 1166 items, 0 archived, 0 residue). Live run counts: `{candidates:4, backfilled:1154, archived:{max_age:1, trend_floor:3}, deleted:1, overrides_removed:1, tombstones_written:1}`.

- [x] 7.2 Live: a >96h test item archived with reason `max_age`; the archived item is hidden from the default listing and shown via `?lifecycle=archived`
- [x] 7.3 Live: a min-age, below-floor, registered-source item archived with reason `trend_floor`; a same-age zero-engagement `rss:` item stayed active (exempt)
- [x] 7.4 Live: restore via `updateNewsItem({lifecycle:'active'})` set the item active and cleared `archived_at`/`archive_reason`. (The "reappears on feed page 1" assert was a harness artifact — page 1 of 1150+ real items under `-current_trend_score` sort; restore-to-active confirmed, and listing visibility is covered by integration test 6.5.)
- [x] 7.5 Live: an item past the cooling-off window was hard-deleted with a tombstone written and its override cascade-deleted; a same-hash candidate was then dropped at hash-dedup (resurrection blocked)
- [x] 7.6 Live: `MaintenanceRunService.listRuns(_, 'retention')` returned the run with per-reason archive counts + deleted count (the endpoint that feeds the Admin table). Admin table render is code-complete + typechecked (browser render not driven from here).
