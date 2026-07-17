## Context

This is the fourth and final change in a four-part retention plan (`engagement-refresh-job` → `trend-decay-scoring` → `dedup-tombstone-ledger` → `news-retention-lifecycle`). All three predecessors are implemented, tested, and live-verified (`current_trend_score`, `engagement_history`, `source_removed`, `REFRESHABLE_SOURCES` from the first two; `recordTombstones`/`news_dedup_ledger` from the third), though none has been archived/synced to `openspec/specs/` yet — this change's spec deltas restate full requirement text rather than diffing an on-disk main spec, per the convention already established by its predecessors.

Verified current state of every file this change touches:
- `news_items` (`newsItem.model.ts`/`interface.ts`) has no `lifecycle` field; nothing ever deletes from it except `NewsItemService.deleteNewsItem` (manual, per-item, already tombstones via `recordTombstones`).
- `getAllNewsItems` (`newsItem.service.ts`) already injects a default sort before constructing `QueryBuilder`; the same pattern (mutate the base query args before `QueryBuilder` sees them) is the right place for the lifecycle default-filter too.
- `MaintenanceRun` (`maintenanceRun.model.ts`) has a rigid `counts` sub-schema shaped for `engagement_refresh` (`candidates, refreshed, source_removed, request_count, errors`) — genuinely incompatible with retention's counts shape (archived-by-reason breakdown, deleted, overrides_removed, tombstones_written). No admin route exists yet for reading `maintenance_runs`.
- `NewsItemCategoryOverride` (`newsItemCategoryOverride.model.ts`) stores `news_item_id` as a `String` (not `ObjectId`), unique-compound with `team_id`.
- `newsItem.route.ts` already has the "register above `/:id`" precedent (`GET /ingestion-runs`) to copy for `GET /maintenance-runs`.
- `report.opportunities.ts`, `chat.retrieval.ts`, `generatedContent.job.ts`, `newsIngestion.utils.ts`'s `fetchRecentEmbeddings`, and `NewsRefresh/newsRefresh.service.ts`'s candidate query are the five read sites this change adds the lifecycle exclusion to (all confirmed at their current post-`trend-decay-scoring` state).
- The frontend feed page reads from `src/lib/mock/`, not the real API — there is no real fetch-by-id call to verify 404-tolerance on, unlike the parent plan document assumed. The Admin dashboard's ingestion-runs table, by contrast, is real and is the pattern to mirror for retention-runs.

Constraints carried forward from the parent plan and the codebase:
- Every new env var is optional with a safe default; server must boot with none of them set.
- Every scheduled job body takes a Redis lock (`SET key <id> PX <ttl> NX`).
- All timestamps are UTC / epoch arithmetic.
- `REFRESHABLE_SOURCES` (from `NewsRefresh/newsRefresh.fetchers.ts`) is the single source of truth for "does this source support refresh" — the engagement-signal guard here must import it, never repeat a literal source list, so any future source registration requires zero retention changes.

## Goals / Non-Goals

**Goals:**
- Archive items that are too old (3–4 day ceiling) or out-of-trend (decayed-score floor, with a grace period and an engagement-signal guard so zero-engagement sources aren't punished for having a permanently-zero score), or whose source reports the item removed.
- Make archival fully reversible (restore via the existing admin update route) up until hard delete.
- Hard-delete archived items after a cooling-off window, cascading tombstone + category-override cleanup so nothing orphans and nothing resurrects.
- Remove archived items from every product read surface while keeping fetch-by-id working (old generated content must keep resolving).
- Give operators visibility into retention runs the same way they already have it for ingestion runs.

**Non-Goals:**
- Story-chain (`story_id`) archive protection or whole-story archival — `story_id` doesn't exist in this codebase yet; that arrives with a later, different plan and is designed to slot into this change's guard-clause query structure as one additional clause (design decision 8), not something this change builds.
- Any `$vectorSearch` adoption for chat retrieval — it stays a plain `find()` + in-app cosine; this change only adds a filter to that existing query.
- Any change to the feed page's data source (mock vs. real API) — out of scope, unrelated to retention.
- Tuning the numeric defaults precisely — ship the plan's stated defaults, watch `maintenance_runs` archive-by-reason counts in practice, tighten later.

## Decisions

1. **Archive-then-delete, never direct delete.** The aggressive part (3–4 days / trend floor) is fully reversible during tuning — a mis-calibrated floor is one restore-PATCH (or, for a batch, one `updateMany`) away from undone, not data loss. Generated content referencing an archived item keeps resolving for the full cooling-off window. Hard delete is the one irreversible step, and it only happens after that window plus the tombstone-before-delete-before-override-cleanup ordering already proven safe by `dedup-tombstone-ledger`.
2. **Config sanity via `superRefine`**, extending the existing block in `config/index.ts` (which already validates the opportunity-weight sum): `NEWS_ARCHIVE_MIN_AGE_HOURS < NEWS_ARCHIVE_MAX_AGE_HOURS`, `NEWS_DELETE_AFTER_DAYS >= 1`, `NEWS_ARCHIVE_TREND_FLOOR` in `[0, 10]`.
3. **The engagement-signal guard in Mongo terms** mirrors `hasEngagementSignal` (from `trend-decay-scoring`) exactly, so the query predicate and the pure function can never drift: `$or: [{ source: { $in: REFRESHABLE_SOURCES } }, { 'engagement.points': { $gt: 0 } }, { 'engagement.comments': { $gt: 0 } }, { 'engagement.stars_delta': { $gt: 0 } }]`. A unit test asserts this predicate agrees with `hasEngagementSignal` across representative documents, including a hypothetical future registry entry, so registering a new source anywhere never silently desyncs the two.
4. **Ingestion-race is a non-goal, not a bug.** Retention deleting between ingestion's dedup read and its insert can in principle produce one duplicate row; the window is milliseconds and the next retention pass removes it (its own hash gets caught by the ledger once tombstoned, or — if it wasn't tombstoned because that exact race window means the delete hadn't happened yet — the next retention pass simply archives/deletes it again on the normal schedule). No cross-job locking is added; the tombstone-first ordering already covers the dangerous direction (a delete completing without ever recording a tombstone).
5. **Stage 1 cap (2000/run) and Stage 2 batch size (500/batch)** bound each run's write burst — meaningful for the first production run against months of backlog, and keep Stage 2's cascade (three sequential operations per batch) from ballooning into one giant multi-minute transaction-equivalent.
6. **`getSingleNewsItem` stays intentionally unfiltered.** Archived is not the same as hidden-by-id — a `GET /news-items/:id` for an archived item must keep resolving (old generated content links depend on it). Documented with a comment at the call site so a future change doesn't "fix" this into a 404.
7. **Composable guard clauses for the Stage 1 archive query**, built as a named array of protection predicates combined with `$nor` rather than one hand-woven query object:
   ```ts
   const protectionClauses: FilterQuery<INewsItem>[] = [
     { _id: { $in: recentlyOverriddenIds } },      // NewsItemCategoryOverride.distinct within 30 days
     { needs_review: true, created_at: { $gte: sevenDaysAgo } },
   ];
   ```
   Two protections exist today; a future story-liveness clause (out of scope here) is designed to land as a third array entry with no restructuring, and each clause gets its own integration test. `recentlyOverriddenIds` is computed via `NewsItemCategoryOverride.distinct('news_item_id', { overridden_at: { $gte: cutoff } })`, then mapped to `ObjectId` for the `_id` comparison (the override model stores `news_item_id` as a plain `String`).
8. **`MaintenanceRun.counts` becomes `Schema.Types.Mixed`**, not a second rigid sub-schema. `engagement_refresh`'s existing writes/reads are byte-for-byte unaffected (Mixed still stores and returns the same shape); the TS-level `IMaintenanceRunCounts` interface becomes a union (`IEngagementRefreshCounts | IRetentionCounts`) so each job's own service code stays fully typed at the call site even though Mongoose no longer enforces one fixed shape at the schema level. This is the minimal change that lets one collection genuinely serve two structurally different jobs, matching the collection's original design intent (R1 design decision 5: "the retention job reuses this same collection with a different job value").
9. **Retention counts shape:** `{ candidates: number; backfilled: number; archived: { max_age: number; trend_floor: number; source_removed: number }; deleted: number; overrides_removed: number; tombstones_written: number }`. No per-source `errors` map (unlike engagement_refresh) — a retention run's only meaningful failure mode is a top-level exception, already covered by `IMaintenanceRun.error`.
10. **Restore clears archive fields unconditionally when `lifecycle` transitions to `'active'`** in `updateNewsItem` — `archived_at`/`archive_reason` are meaningless on an active item and must not linger as stale data a later read path could misinterpret.
11. **Read-path filters use `$ne: 'archived'`, never `lifecycle: 'active'`.** Legacy rows predating this change (and the brief window before the backfill's first tick) lack the field entirely; `$ne` treats "field absent" as passing (not archived), matching the requirement that pre-migration rows are treated as active. Every one of the five surface-exclusion call sites uses this same operator for consistency.
12. **Admin route ordering.** `GET /news-items/maintenance-runs` is registered directly beside `GET /news-items/ingestion-runs`, both above the `/:id` routes — same reason, same fix, same file region.

## Risks / Trade-offs

- **[Risk] A mis-tuned trend floor archives more than intended.** → Mitigated by decision 1 (fully reversible pre-hard-delete) and by shipping the plan's stated defaults rather than inventing new ones; `maintenance_runs`'s archived-by-reason counts make over-archival visible immediately.
- **[Risk] `MaintenanceRun.counts` losing schema-level shape validation.** → Accepted; each job's service function is still the single writer for its own shape, and TS-level typing (decision 8) catches shape mistakes at compile time even though Mongo itself no longer will.
- **[Trade-off] Engagement-less sources (RSS, etc.) never archive on the trend floor, only the max-age ceiling.** → Intentional (decision 3 / the engagement-signal guard) — a naive floor rule would archive every zero-engagement item at the minimum-age boundary, undoing prior work to ensure those sources ingest at all.
- **[Risk] Stage 2 crash between tombstone-write and item-delete.** → Already proven safe by `dedup-tombstone-ledger`'s tombstone-before-delete invariant; the extra tombstone from a retried batch is harmless (idempotent `recordTombstones`).
- **[Risk] Ingestion racing retention's delete.** → Accepted per decision 4; bounded to one duplicate row, self-correcting on the next pass.

## Migration Plan

- All five new env vars are optional with defaults; no `.env` changes required, server boots with none set.
- `lifecycle`, `archived_at`, `archive_reason` are additive and optional (`lifecycle` defaults `'active'` at the schema level for new writes); the retention job's own idempotent backfill (`updateMany({ lifecycle: { $exists: false } }, { $set: { lifecycle: 'active' } })`) handles existing rows on its first tick — no separate migration script.
- `MaintenanceRun.counts`'s schema-type change (sub-schema → Mixed) requires no data migration — existing `engagement_refresh` documents already conform to a shape that Mixed happily stores and returns unchanged.
- Rollback: disabling the retention scheduler call site stops new archival/deletion; already-archived-but-not-yet-deleted items remain restorable via the admin PATCH exactly as before. Already hard-deleted items are, definitionally, not recoverable by this change or any other — that is the intended and accepted risk of Stage 2, bounded by the 14-day cooling-off window during which any calibration mistake is still fixable.

## Open Questions

None — scope, defaults, and the composable-guard-clause extension point are fixed by the parent plan (`2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md`, Change R4). The story-chain protection clause and whole-story archival obligations for a later plan are recorded here (Non-Goals) exactly so that plan's proposal doesn't need to reopen this change's spec.
