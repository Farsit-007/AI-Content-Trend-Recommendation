# News Retention & Cleanup — Trend Decay, Lifecycle, and Safe Deletion

**Date:** 2026-07-16
**Parent doc:** [NEWS-PIPELINE-ANALYSIS.md](./NEWS-PIPELINE-ANALYSIS.md)
**Covers reported problem:** (3) "Deleting old and not trending news within 3–4 days or immediately when it is out of trend to keep db clean."

---

## 1. Current state (verified)

- **Nothing ever deletes from `news_items`.** No TTL index (`newsItem.model.ts` defines only the unique `content_hash` index), no cleanup cron (`backend/src/app/lib/scheduler.ts` schedules ingestion, analytics refresh, and auto-generation only), no bulk delete anywhere (grep confirms the only delete path is the manual per-item admin endpoint, `newsItem.service.ts:124-127`).
- **"Out of trend" is currently undetectable.** `engagement` and `trend_score` are written once at ingest (`newsIngestion.service.ts:94-99`) and never refreshed. An item that exploded after ingestion and an item that died an hour later look identical in the DB forever.
- The DB therefore grows monotonically, the feed accumulates stale items, and every ingestion run's semantic-dedup pool and every feed query scans an ever-larger collection.

## 2. Why the naive approach (Mongo TTL index / cron `deleteMany({created_at: {$lt: cutoff}})`) is wrong

The user's requirement — "the approach should not have any flaws… production service" — rules out naive TTL because of four concrete hazards in this codebase:

1. **Resurrection.** The unique `content_hash` (sha256 of `source:url`, `newsIngestion.utils.ts:14-15`) is the *only* thing preventing re-ingestion of a URL. Delete the row and the hash goes with it. For most sources the 72 h freshness filter would block re-ingestion of old items — but **GitHub Trending items have `published_at: undefined` and bypass `filterFresh` entirely** (`newsIngestion.utils.ts:23` treats missing dates as fresh). A trending repo deleted on day 4 that is still on the trending page gets re-ingested on day 4's next run, re-categorized (LLM cost), re-embedded, and reappears in the feed as "new." Same risk for any RSS feed that keeps old posts in the feed with sketchy dates. Deletion without a tombstone ledger is a re-ingestion loop.
2. **Orphaned references.** `news_item_category_overrides` rows reference `news_item_id` (`newsItemCategoryOverride.model.ts:5`, unique compound index with `team_id`). TTL deletion leaves permanent orphans. (Content generation is safe: it soft-fails on a missing news item by design, `contentGeneration.service.ts:31-39`. Report opportunities read live news items and would simply stop suggesting deleted ones — safe.)
3. **No trend signal to act on.** "Immediately when it is out of trend" requires knowing engagement *now* vs *before* — data that doesn't exist (see §1). A TTL index can only express "age > X," which deletes rising stories and keeps dead ones equally.
4. **Mongo TTL timing is imprecise and invisible.** The TTL monitor runs ~every 60 s and deletes without any hook — no cascade cleanup, no run history, no way to protect referenced items. Fine for `ingestion_runs` (nothing references them — Sources doc §C.1); wrong for `news_items`.

The correct design: **(a) refresh engagement → (b) compute decayed trend → (c) lifecycle states with archive-then-delete → (d) tombstone ledger.** Each piece below.

---

## 3. Engagement re-polling job (prerequisite — Phase 3 in the roadmap)

New scheduled job `refreshEngagement` (own cron, default hourly: `NEWS_REFRESH_CRON=30 * * * *`, offset from ingestion's `0 */3` so they don't stack), following the existing scheduler pattern in `scheduler.ts`.

**Scope per run:** items with `lifecycle: 'active'` and `created_at` within the last 96 h, from sources that support re-fetch:

| Source | Re-fetch endpoint | Cost |
|---|---|---|
| hackernews | `GET hn.algolia.com/api/v1/items/{source_id}` (or Firebase item.json) | 1 req/item — batch via Algolia `search?tags=story_{id1},story_{id2}` where possible |
| reddit | `GET oauth.reddit.com/api/info?id=t3_{id1},t3_{id2},…` — **100 items per request** | ~1–3 req/run |
| devto | `GET dev.to/api/articles/{id}` | 1 req/item; cap at ~50/run |
| github_trending | repo re-appears in the trending scrape → stars-delta refresh comes free with ingestion (Sources doc §A.3.3) | 0 extra |
| rss:* / editorial | no engagement signal | skipped |

**Schema addition (`newsItem.model.ts` / `newsItem.interface.ts`):**

```ts
engagement_history: [{ at: Date, points: Number, comments: Number, stars_delta: Number }],
// cap at ~32 snapshots per item (use $slice on push); hourly for 96h = 96 raw,
// so store every snapshot for the first 6h, then 3-hourly — or simply $slice: -32
engagement_refreshed_at: Date,
```

**Caveats:**
- Rate-limit discipline: cap total refresh requests per run (env `NEWS_REFRESH_MAX_REQUESTS=200`); prioritize youngest items (they change fastest) and items closest to the archive threshold (the decision they inform is imminent).
- A 404/410 on re-fetch (post deleted/removed at the source) is itself a strong "out of trend" signal → mark `source_removed: true`; the lifecycle job (§5) archives these immediately. Do **not** hard-delete on 404 — removal at the source doesn't retroactively unpublish content the team may have generated from it.
- Idempotency/locking: wrap the job body in a Redis lock (`SET refresh_lock NX PX 3300000`) per the multi-instance caveat in the master doc §5.5.

## 4. Decayed trend score

Add a pure function (natural home: `newsIngestion.scoring.ts`, alongside `scoreTrend`):

```
current_trend_score(item, now):
  base      = scoreTrend(latest points, comments, stars_delta)     // existing log-scale fn
  velocity  = (weighted(latest) − weighted(previous)) / hours_between   // from engagement_history
  age_hours = now − (published_at ?? created_at)
  decay     = exp(−age_hours / TAU)          // TAU default 36h (halves roughly every 25h)
  score     = clamp( base·decay + VELOCITY_BONUS·log10(1+max(0,velocity)), 0, 10 )
```

- Stored on the item as `current_trend_score` (recomputed by the refresh job §3 and by the lifecycle job §5) so feed queries can sort on it with a plain index — never computed per-request.
- `TAU` and `VELOCITY_BONUS` are env-tunable (`NEWS_TREND_DECAY_TAU_HOURS=36`, `NEWS_TREND_VELOCITY_BONUS=2`); defaults chosen so that an item with zero engagement growth falls below the archive floor (§5) at ~3 days — matching the user's "3–4 days" requirement by construction.
- Sources with no engagement signal (rss:*) decay on age alone — their `base` never grows, so they age out on the same clock. This is correct: an editorial article's newsworthiness *is* its age.
- **Immediate benefit before deletion even ships:** pointing the feed's default sort at `current_trend_score` makes stale items sink from the UI on day one of Phase 3 — most of the *perceived* "old news polluting the feed" problem is solved here, which lowers the pressure to delete aggressively (and aggressive deletion is where the real risks live).

## 5. Lifecycle states & the cleanup job

**Schema:** `lifecycle: { type: String, enum: ['active','archived'], default: 'active', index: true }` + `archived_at: Date` + `archive_reason: String`.

**New job `newsRetention`** (cron `NEWS_RETENTION_CRON=15 */6 * * *`, Redis-locked), two stages:

**Stage 1 — archive (`active → archived`).** Archive when ANY of:
- `age > NEWS_ARCHIVE_MAX_AGE_HOURS` (default **96 h** = the "3–4 days" requirement), OR
- `age > NEWS_ARCHIVE_MIN_AGE_HOURS` (default 36 h) **and** `current_trend_score < NEWS_ARCHIVE_TREND_FLOOR` (default 2.0) — this is "immediately when out of trend," with the min-age guard so a slow-starting story gets at least 36 h to prove itself, OR
- `source_removed: true` (§3 caveat).

**Never archive** (protection list, checked in the same query):
- items that are part of a story chain whose *story* is still live (`story_id` present and any chain member is `active` with `current_trend_score ≥ floor` — see Dedup doc §6; a story stays alive while any chapter trends),
- items referenced by a category override **less than 30 days old** (someone manually curated it — that's an investment; join via `NewsItemCategoryOverride.distinct('news_item_id')`),
- items with `needs_review: true` that are `< 7 days` old (give the review queue time).

**Effect of `archived`:** excluded from the default feed query (`getAllNewsItems` gains `lifecycle: 'active'` as a base filter — single-line change in `newsItem.service.ts:57`; keep an explicit `?lifecycle=archived` escape hatch for the admin UI), excluded from report opportunity candidates, excluded from `fetchRecentEmbeddings`' semantic pool implicitly (72 h window already excludes them, but add the lifecycle filter for correctness). Chat retrieval over the Atlas vector index `news_items_vector_index` (`scripts/createVectorIndexes.ts:16`) should add a `lifecycle` pre-filter — requires adding `{ type: 'filter', path: 'lifecycle' }` to the index definition and re-creating it (Atlas vector indexes only allow filtering on declared filter fields — a real migration step, list it in the rollout checklist).

**Stage 2 — hard delete (`archived → gone`).** Delete items `archived_at < now − NEWS_DELETE_AFTER_DAYS` (default **14 days**), in batches (`limit: 500` per run) with a cascade, in this order:
1. Insert tombstones into the dedup ledger (§6) — *before* the delete, so a crash between steps leaves a harmless extra tombstone, never a resurrection window.
2. `NewsItemCategoryOverride.deleteMany({ news_item_id: { $in: batchIds } })`.
3. `NewsItem.deleteMany({ _id: { $in: batchIds } })`.
4. Log a retention-run summary (counts per stage) into `ingestion_runs`-style history (Sources doc §C.1) so cleanup is as observable as ingestion.

**Why archive-then-delete instead of immediate delete:** (a) it makes the aggressive part (archive at 3–4 days / out-of-trend) fully reversible during tuning — mis-calibrated `TREND_FLOOR` un-archives with one update query instead of losing data; (b) generated-content workflows that reference a news item (`news_item_id` in content generation) keep resolving for 14 more days; (c) the demo-day/mock-data rule in CLAUDE.md ("mock data stays until after demo") extends culturally: destructive operations get a cooling-off window.

## 6. Dedup tombstone ledger (mandatory before Stage 2 ships)

New collection `news_dedup_ledger`:

```ts
{
  content_hash: { type: String, unique: true },
  embedding: [Number],           // carried over so semantic dedup can still see it (optional, see caveat)
  title: String,                 // debugging only
  deleted_at: { type: Date, index: { expireAfterSeconds: 30*24*3600 } },  // ledger self-cleans at 30d
}
```

- `dedupeAgainstStored` (`newsIngestion.utils.ts:30`) extends its lookup: `NewsItem.find({content_hash: {$in: hashes}})` **plus** `NewsDedupLedger.find({content_hash: {$in: hashes}})` — two indexed `$in` queries, still one round-trip each.
- A Mongo TTL index is safe *here* (unlike on `news_items`) because nothing references ledger rows and imprecise timing is harmless.
- **Ledger expiry is a feature, not a bug:** after 30 days, a story that resurfaces is genuinely re-newsworthy ("Fable trends again in September") and *should* re-enter the pipeline — which also serves the progressive-trend requirement.
- **Embedding-in-ledger caveat:** including embeddings lets the semantic-dedup recent pool see deleted items, but the pool cutoff is only 72 h (`newsIngestion.service.ts:55-56`) while archive starts at 36–96 h — overlap is small. Recommendation: **omit embeddings from the ledger initially** (saves 1536 floats × N rows; hash-dedup alone stops exact resurrection) and add them only if run-history data shows semantic re-admission of just-deleted paraphrases actually happening.

## 7. Config summary (all new vars, all optional with these defaults)

```
NEWS_REFRESH_CRON=30 * * * *
NEWS_REFRESH_MAX_REQUESTS=200
NEWS_TREND_DECAY_TAU_HOURS=36
NEWS_TREND_VELOCITY_BONUS=2
NEWS_RETENTION_CRON=15 */6 * * *
NEWS_ARCHIVE_MAX_AGE_HOURS=96        # "3-4 days" hard ceiling
NEWS_ARCHIVE_MIN_AGE_HOURS=36        # grace period before trend-floor can archive
NEWS_ARCHIVE_TREND_FLOOR=2.0         # "out of trend" threshold on decayed score
NEWS_DELETE_AFTER_DAYS=14            # archived → hard delete
NEWS_DEDUP_LEDGER_TTL_DAYS=30
```

Validate in `config/index.ts` following the existing zod pattern (strings with defaults, `Number(...)` in the export), including a `superRefine` sanity check that `MIN_AGE < MAX_AGE` and `DELETE_AFTER_DAYS ≥ 1`.

## 8. Remaining caveats & failure modes

1. **Race with in-flight ingestion:** retention deleting a row between ingestion's `dedupeAgainstStored` read and its `insertMany` re-creates the item. Window is milliseconds and consequence is one duplicate row that the *next* retention pass removes — acceptable. Do not add cross-job locking for this; the tombstone-first ordering in §5 already covers the dangerous direction.
2. **Clock discipline:** all cutoffs are epoch-millisecond arithmetic (`Date.now()` style, matching `filterFresh`). Never introduce local-date parsing; the server TZ and Atlas TZ differ.
3. **Feed cache staleness:** report/content Redis caches (`report_cache_ttl` 6 h, `content_cache_ttl` 24 h) may reference items archived mid-TTL. Content generation already soft-fails (safe). Reports rebuild on TTL expiry (≤ 6 h stale window — acceptable; document, don't engineer around).
4. **Frontend contract:** any UI fetch-by-id of a news item must tolerate 404 (deleted) and render archived items read-only if linked from old generated content.
5. **Tuning is empirical:** ship with conservative defaults above, watch retention-run summaries for 1–2 weeks (how many items archive by age vs trend-floor vs source-removed), then tighten. The floor value 2.0 is a starting point, not a law.
6. **Backfill migration:** existing rows lack `lifecycle`. Migration = `updateMany({lifecycle: {$exists: false}}, {$set: {lifecycle: 'active'}})`, then let the retention job archive the backlog naturally over its first few runs (rate-limit Stage 1 to ~2000 items/run so the first run doesn't archive months of backlog in one write burst while the team is watching the feed).

## Acceptance checklist

- [ ] Refresh job visibly updates `engagement_history` and `current_trend_score` for HN/Reddit/dev.to items within one hour of ingest
- [ ] Feed default sort uses `current_trend_score`; a 4-day-old item no longer appears on page 1
- [ ] Item archived by trend-floor is restorable via admin (`lifecycle: 'active'` update) and reappears in feed
- [ ] Hard-delete test: delete a `github_trending` item via full Stage 2, re-run ingestion while the repo still trends → tombstone blocks re-insert (0 duplicates)
- [ ] Override cascade verified: deleting an overridden item removes the override row
- [ ] Vector index rebuilt with `lifecycle` filter field; chat retrieval returns no archived items
- [ ] DB item count plateaus over a 2-week observation window
