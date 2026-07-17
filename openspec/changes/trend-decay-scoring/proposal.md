## Why

`trend_score` is written once at ingest and never changes, and the feed's default sort (`-createdAt`) references a field that doesn't exist on the `news_items` schema (it uses `created_at`), so the feed currently has no meaningful default order at all. With engagement history now being collected by the refresh job (`engagement-refresh-job`, archived), a decayed, velocity-aware live score can be computed and stored, giving the feed, chat retrieval, reports, and auto-generation a signal that makes stale items sink automatically — and giving the future retention job the "out of trend" trigger the reported requirement needs.

## What Changes

- New pure function `computeCurrentTrendScore(item, now)` in `newsIngestion.scoring.ts` (alongside `scoreTrend`): combines the existing ingest-formula trend base with an exponential age-decay factor and a velocity bonus derived from the two most recent `engagement_history` snapshots.
- New derived helper `hasEngagementSignal(item)`: true iff the item's source is in the engagement-refresh registry (`REFRESHABLE_SOURCES`) OR its latest weighted engagement is nonzero. Exported for later consumption (retention floor rule); not stored.
- New stored field `current_trend_score` (Number, indexed) on `news_items`: set at ingest (≈ equal to `trend_score` at age 0) and recomputed for every item the engagement-refresh job touches, whether or not the source reported new numbers (decay advances with time regardless).
- One-time idempotent backfill (`current_trend_score` unset → `$set` from `trend_score`), run at the start of the refresh job so existing rows get a value without a separate migration step.
- Ranking consumers switch to the live score with a fallback to the frozen snapshot for not-yet-backfilled rows (`current_trend_score ?? trend_score`):
  - Feed default sort (`GET /news-items` with no explicit `?sort=`) becomes `-current_trend_score -created_at`; an explicit `?sort=` is still honored unchanged.
  - Chat retrieval's candidate pool sort switches from `trend_score` to `current_trend_score`.
  - Report opportunity scoring and auto-generation candidate selection consume `current_trend_score ?? trend_score`.
- New config: `NEWS_TREND_DECAY_TAU_HOURS` (default 36), `NEWS_TREND_VELOCITY_BONUS` (default 2) — both optional with safe defaults.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `engagement-refresh`: adds the decayed `current_trend_score` computation (at ingest and on every refresh touch) and switches the feed/chat/report/auto-generation ranking consumers from the frozen `trend_score` to the live score. `openspec/specs/engagement-refresh/` has not yet been synced from the archived `engagement-refresh-job` change, so this change's delta spec restates the full capability text (per plan §0.4.2) rather than diffing against an on-disk main spec; syncing both changes' deltas together will produce the complete capability.

## Impact

- `backend/src/app/modules/NewsIngestion/newsIngestion.scoring.ts` — new `computeCurrentTrendScore`, `hasEngagementSignal`.
- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts` — ingestion payload gains `current_trend_score`.
- `backend/src/app/modules/NewsItem/newsItem.model.ts` + `newsItem.interface.ts` — new indexed field `current_trend_score`.
- `backend/src/app/modules/NewsRefresh/newsRefresh.service.ts` — recompute + `$set` per touched item; idempotent backfill statement at job start.
- `backend/src/app/modules/NewsItem/newsItem.service.ts` — default-sort injection before `QueryBuilder` construction.
- `backend/src/app/modules/Chat/chat.retrieval.ts`, `backend/src/app/modules/Report/report.opportunities.ts` (or equivalent path), `backend/src/app/modules/GeneratedContent/generatedContent.job.ts` — ranking/selection queries switch to the live score.
- `backend/src/app/config/index.ts` + `backend/.env.example` — `NEWS_TREND_DECAY_TAU_HOURS`, `NEWS_TREND_VELOCITY_BONUS`.

No frontend changes: `frontend/src/lib/api/types.ts` has no `NewsItem` type today (the feed page still reads from `src/lib/mock/`), so there is nothing to extend.

**Out of scope for this change** (belongs to later changes in the same plan): the dedup tombstone ledger, archive/hard-delete lifecycle jobs, story chains, and any `lifecycle` field or filtering (does not exist yet).
