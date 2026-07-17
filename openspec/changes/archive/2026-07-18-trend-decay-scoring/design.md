## Context

`news_items.trend_score` is written once by the ingestion pipeline (`newsIngestion.service.ts:205,236`) via the pure `scoreTrend(points, comments, starsDelta)` (`newsIngestion.scoring.ts:28-31`: `round1(min(10, log10(points + 2·comments + 3·stars + 1) × 3))`) and never recomputed. The feed's default sort is `-createdAt` (`QueryBuilder.sort():58`), a field that doesn't exist on this schema (`newsItem.model.ts` uses `created_at`, no `timestamps` option) — so today the feed has no meaningful default order at all.

The archived `engagement-refresh-job` change (capability `engagement-refresh`, not yet synced to `openspec/specs/`) added `engagement_history` (bounded `$slice: -32` snapshots, `{ at, points, comments, stars_delta }`), `engagement_refreshed_at`, and `source_removed` to `news_items`, and a scheduled `runEngagementRefresh()` job (`NewsRefresh/newsRefresh.service.ts`) that re-polls hackernews/reddit/devto on an hourly cron, touching the youngest items first under a request budget. That job is this change's only producer of fresh engagement data — this change adds the scoring layer on top of it.

Constraints carried forward from the parent plan (`2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md`, Change R2):
- Config pattern is zod `envSchema` with `.default()`/`.optional()` string values, `Number(...)` in the exported config object — every new env var must be optional with a safe default.
- All timestamps are UTC / epoch arithmetic (`Date.now()`-based), never local date parsing.
- `openspec/specs/` is empty — this change's delta spec restates full requirement text rather than diffing an on-disk main spec.
- No `lifecycle` field exists yet (that arrives with a later retention change) — nothing in this change may reference it.

## Goals / Non-Goals

**Goals:**
- Compute a decayed, velocity-aware `current_trend_score` (0–10) per item: the ingest-time trend base times an age-decay factor, plus a bounded bonus for rising engagement.
- Recompute it at exactly two sites — ingest (initial value) and the engagement-refresh job (every touched item, whether or not the source returned new numbers) — so it's never computed per-request.
- Switch feed default sort, chat retrieval's candidate pool, report opportunity scoring, and auto-generation candidate selection to the live score, falling back to the frozen `trend_score` for rows that haven't been backfilled/refreshed yet.
- Provide a derived (not stored) `hasEngagementSignal(item)` helper for a later retention change's archive-floor guard.
- Backfill existing rows idempotently, folded into the refresh job rather than a separate operator-run migration.

**Non-Goals:**
- Any `lifecycle`, archive, or hard-delete behavior — that is a later change in the same plan.
- Changing `scoreTrend` itself, the opportunity-score formula, or dedup/embedding logic.
- Recomputing the score for items outside the refresh job's window/budget (items older than `NEWS_REFRESH_WINDOW_HOURS` simply keep their last-computed value — acceptable, since a later retention change's max-age ceiling handles them by age alone, not score).
- Any frontend change — the feed page currently renders from `src/lib/mock/`, not the live API, so there is no real `NewsItem` type to extend yet.

## Decisions

1. **Formula and placement.** `computeCurrentTrendScore(item, now)` lives in `newsIngestion.scoring.ts` beside `scoreTrend`, and stays pure (no DB/Redis access) so a later corroboration/merge feature can call it directly without inheriting the refresh job's context:
   ```
   base      = scoreTrend(engagement.points, engagement.comments, engagement.stars_delta)   // 0–10
   ageHours  = (now − (published_at ?? created_at)) / 3_600_000
   decay     = exp(−ageHours / NEWS_TREND_DECAY_TAU_HOURS)                                   // default TAU 36
   velocity  = engagement_history.length ≥ 2
               ? max(0, (w(last) − w(prev)) / max(hoursBetween(last, prev), 1))
               : 0                                                                            // w = points + 2·comments + 3·stars
   score     = round1(clamp(base·decay + NEWS_TREND_VELOCITY_BONUS·log10(1 + velocity), 0, 10))
   ```
   `hasEngagementSignal(item)` is a separate exported pure function: `REFRESHABLE_SOURCES.includes(item.source) || weighted(item.engagement) > 0`, importing `REFRESHABLE_SOURCES` from `NewsRefresh/newsRefresh.fetchers.ts` (the existing single source of truth) rather than repeating a literal source list.

2. **Two recompute sites, no others.**
   - **Ingest** (`newsIngestion.service.ts` payload construction, next to the existing `trend_score: item.trend_score` line): `current_trend_score: computeCurrentTrendScore(item, now)` with `engagement_history` empty and `now ≈ published_at/created_at`, so it lands ≈ equal to `trend_score` at age 0.
   - **Refresh job** (`NewsRefresh/newsRefresh.service.ts`, inside `runEngagementRefresh()`): for every candidate the job touches — both successfully refreshed items (after the new snapshot is computed, before it's pushed into `bulkOps`) and `source_removed` items (decay still advances; no new snapshot exists, so velocity stays 0) — add `current_trend_score` to the same `$set` clause already being built for that item. No third recompute site: the DB read path never computes it.

3. **Backfill is one idempotent aggregation-pipeline `updateMany`, not a migration script.** At the very start of `runEngagementRefresh()` (before the candidate query), run:
   ```js
   NewsItem.updateMany({ current_trend_score: { $exists: false } }, [{ $set: { current_trend_score: '$trend_score' } }]);
   ```
   Matches only never-touched rows, so it's a no-op after the first run. This mirrors the parent plan's explicit call to fold backfill into the refresh job (§0.2.5) rather than a separate operator step.

4. **Fallback expression at every read site, not a migration dependency.** Every ranking consumer reads `current_trend_score ?? trend_score` (application-level) or accepts that a still-`null` value sorts last in a descending Mongo sort (query-level) — acceptable because the backfill above runs on every refresh-job tick, so the window where any row is genuinely unbackfilled is at most one refresh cycle after this change deploys.

5. **Consumer-by-consumer wiring** (all four call sites read today, confirmed against current source):
   - `newsItem.service.ts` `getAllNewsItems`: inject `remainingQuery.sort = '-current_trend_score -created_at'` immediately after destructuring `team_id`, only when `remainingQuery.sort` is falsy — *before* `QueryBuilder` is constructed, since `QueryBuilder.sort()`'s own default (`-createdAt`) is the broken one this change replaces. Do not modify `QueryBuilder` itself (shared by other modules). An explicit `?sort=` on the request is untouched.
   - `chat.retrieval.ts` `fetchNewsContext`/`rankNewsItems`: add `current_trend_score` to the Mongo projection and switch `.sort({ trend_score: -1 })` → `.sort({ current_trend_score: -1 })`; `NewsCandidate` gains optional `current_trend_score`, and `rankNewsItems`'s in-app pool sort switches to `(b.current_trend_score ?? b.trend_score) - (a.current_trend_score ?? a.trend_score)`.
   - `report.opportunities.ts` `getTopOpportunities`: add `current_trend_score` to `.select()`; the `combined_score` computation (`(item.trend_score ?? 0) * audienceMatchScore` when embeddings exist) switches its trend term to `(item.current_trend_score ?? item.trend_score ?? 0)`. The response's `trend_score` field itself is left as-is (still the frozen ingest snapshot) — only the ranking math changes, no API shape change.
   - `generatedContent.job.ts` `runAutoGeneration`: sort becomes `{ opportunity_score: -1, current_trend_score: -1, trend_score: -1 }` — Mongo's multi-key sort already gives the fallback behavior for the transient unbackfilled window without extra code.

6. **`current_trend_score` is never user-writable.** It is *not* added to `updateNewsItemValidation` — the admin `PATCH /news-items/:id` route stays scoped to fields a human can legitimately override (category, etc.); this field is entirely system-maintained.

7. **Config additions follow the existing `news_ingestion` block exactly**: `NEWS_TREND_DECAY_TAU_HOURS` (default `'36'`) and `NEWS_TREND_VELOCITY_BONUS` (default `'2'`) go into `envSchema` as optional strings and are exported as `Number(...)` under `news_ingestion.trend_decay: { tau_hours, velocity_bonus }`, alongside the existing `news_ingestion.refresh` block — both optional, server boots with neither set.

## Risks / Trade-offs

- **[Risk] Zero-engagement sources (`rss:*`, unconfigured sources) score 0 from birth.** → Accepted and intentional: `scoreTrend(0,0,0) = 0`. The feed's `-current_trend_score -created_at` tie-break means same-score items (all the zero-engagement ones) still order by freshness among themselves. A later retention change's archive-floor rule is documented to gate on `hasEngagementSignal` for exactly this reason — not this change's concern to enforce, only to expose the helper correctly.
- **[Risk] Transient odd ordering for unbackfilled rows immediately after deploy.** → Mitigated by decision 4 (fallback everywhere) and decision 3 (backfill runs every refresh-job tick, so the window is at most one cron interval).
- **[Trade-off] Items past the 96 h refresh window stop getting a fresher score.** → Accepted per Non-Goals — a later retention change's max-age ceiling, not the score, is what bounds those items.
- **[Risk] `computeCurrentTrendScore` drifting out of sync if called with stale `now`.** → Mitigated by always passing the same `now` used for the refresh job's snapshot timestamp (`newsRefresh.service.ts`'s existing `const now = new Date()`), never a fresh `Date.now()` read per item.

## Migration Plan

- Both new env vars are optional with defaults; no `.env` changes required to deploy, server boots with neither set.
- `current_trend_score` is additive and optional on the schema; existing rows get it via the in-job backfill on the first post-deploy refresh tick — no separate migration script, no downtime.
- Rollback: reverting the ranking-consumer changes and the refresh-job `$set` addition returns to frozen-`trend_score` behavior with no data loss; the stored `current_trend_score` field simply stops being read (harmless to leave in place).

## Open Questions

None — formula, defaults, and consumer list are fixed by the parent plan (`2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md`, Change R2). Calibration rationale (TAU=36h, floor crossing ~40–50h) is documented there as non-binding context, not encoded as spec scenarios, since it would break under future tuning.
