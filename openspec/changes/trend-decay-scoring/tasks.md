## 1. Scoring

- [x] 1.1 `computeCurrentTrendScore(item, now)` + `hasEngagementSignal(item)` in `newsIngestion.scoring.ts` per the design.md formula (pure, exported, imports `REFRESHABLE_SOURCES` from `NewsRefresh/newsRefresh.fetchers.ts`)
- [x] 1.2 Config: `NEWS_TREND_DECAY_TAU_HOURS` default `'36'`, `NEWS_TREND_VELOCITY_BONUS` default `'2'` in envSchema; export under `news_ingestion.trend_decay: { tau_hours, velocity_bonus }`; document both in `.env.example`
- [x] 1.3 Unit tests: decay monotonicity; velocity bonus computed from the last two history snapshots; clamp/round to [0,10]; empty-history velocity is 0; zero-engagement base is 0; `published_at`-missing falls back to `created_at`; `hasEngagementSignal` true for a registry source with zero engagement and for a non-registry source with nonzero engagement, false otherwise

## 2. Storage

- [x] 2.1 `current_trend_score: { type: Number, index: true }` on `newsItem.model.ts` + optional field on `newsItem.interface.ts`
- [x] 2.2 `newsIngestion.service.ts`: ingestion payload sets `current_trend_score: computeCurrentTrendScore(item, now)` alongside the existing `trend_score` line
- [x] 2.3 `NewsRefresh/newsRefresh.service.ts`: at the start of `runEngagementRefresh()`, run the idempotent backfill `NewsItem.updateMany({ current_trend_score: { $exists: false } }, [{ $set: { current_trend_score: '$trend_score' } }])`
- [x] 2.4 `NewsRefresh/newsRefresh.service.ts`: recompute `current_trend_score` and add it to the `$set` clause for every touched candidate — both the refreshed-engagement branch and the `source_removed` branch (decay-only, no new snapshot)
- [x] 2.5 Integration test: two refresh cycles with static mocked engagement (no growth) → `current_trend_score` strictly decreases; a `source_removed` item's score is also recomputed on the run that removes it; backfill sets `current_trend_score` on pre-existing rows and leaves already-set rows untouched

## 3. Consumers

- [x] 3.1 `newsItem.service.ts` `getAllNewsItems`: when `remainingQuery.sort` is absent, set it to `'-current_trend_score -created_at'` before constructing `QueryBuilder` (do not modify `QueryBuilder` itself — shared by other modules)
- [x] 3.2 `newsItem.validation.ts`: confirm `current_trend_score` is absent from `updateNewsItemValidation` (system-maintained field, never admin-writable) — add an explicit `.strict()`/omit note only if the schema would otherwise silently accept it
- [x] 3.3 `chat.retrieval.ts`: add `current_trend_score` to the `fetchNewsContext` projection, switch the Mongo sort to `{ current_trend_score: -1 }`, add optional `current_trend_score` to `NewsCandidate`, and switch `rankNewsItems`'s pool sort to `(current_trend_score ?? trend_score)`
- [x] 3.4 `report.opportunities.ts` `getTopOpportunities`: add `current_trend_score` to `.select()`; use `(item.current_trend_score ?? item.trend_score ?? 0)` in the `combined_score` computation (response's `trend_score` field stays the frozen ingest snapshot, unchanged)
- [x] 3.5 `generatedContent.job.ts` `runAutoGeneration`: sort becomes `{ opportunity_score: -1, current_trend_score: -1, trend_score: -1 }`

## 4. Verification

- [x] 4.1 `cd backend && npm run build` passes; server boots with no `NEWS_TREND_*` vars set
- [x] 4.2 Live (`npm run verify:trend-decay-live`, against real Atlas data): `GET`-equivalent `NewsItemService.getAllNewsItems` with no `sort` returns page 1 ordered by `current_trend_score` descending; `?sort=-created_at` still honored unchanged. (The strict-decrease-across-two-cycles claim is proven deterministically by `newsRefresh.integration.test.ts`'s fake-timer test — a live real-time rerun of that specific check was attempted but proved unreliable due to dev.to API rate-limiting during this session, not a code issue.)
- [x] 4.3 Live: confirmed a pre-existing row with `current_trend_score` cleared gets backfilled (`undefined` → `2.1`) after one refresh run
