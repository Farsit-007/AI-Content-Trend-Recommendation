# FARSIT — News Retention & Cleanup: OpenSpec Execution Plan

**Problem (as reported):** Delete old / out-of-trend news within 3–4 days (or immediately when out of trend) to keep the DB clean.
**Parent analysis:** [MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md](./MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md) — Problem 3 (§3 interlocks, §4 Phases 3–4) and [FARSIT-NEWS-PIPELINE-RETENTION.md](./FARSIT-NEWS-PIPELINE-RETENTION.md) (the design deep-dive).
**Sibling plans reconciled (read before executing):** [RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md](./RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md) (executed & archived — this plan's baseline), [FARSIT-NEW-SOURCES-OPENSPEC-PLAN.md](./FARSIT-NEW-SOURCES-OPENSPEC-PLAN.md) (7 upcoming adapters — Problem 2), [FARSIT-NEWS-PIPELINE-DEDUP-UPDATES.md](./FARSIT-NEWS-PIPELINE-DEDUP-UPDATES.md) (story chains & two-band dedup — Problem 4). §0.3 lists every point where those efforts touch this one and which side owns it.
**Date:** 2026-07-16

> Every fact below was re-verified directly against the code on 2026-07-16, **after** the four source-fix changes from [RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md](./RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md) were implemented and archived (`news-source-quick-wins`, `ingestion-run-observability`, `reddit-oauth-adapter`, `github-trending-hardening`). Line references here supersede the ones in the retention deep-dive where they differ. §0.2 lists the places where the deep-dive is now out of date — read it before proposing anything, or the generated specs will encode stale assumptions.

This plan decomposes the fix into **4 OpenSpec changes**, ordered so each is independently shippable and verifiable. For each change, run:

```
/opsx:propose   → feed it the "Proposal input" + "Design decisions" + "Spec delta" + "Tasks" sections below
/opsx:apply     → implement the generated tasks
verify          → run the "Verification" steps below
/opsx:archive   → archive when the change's DoD passes
```

---

## 0. Verified baseline (read before proposing anything)

### 0.1 Facts (all verified 2026-07-16)

| Fact | Location |
|---|---|
| **Nothing ever deletes from `news_items`.** No TTL index (only the unique `content_hash` index), no cleanup cron, no bulk delete. The only delete path is the manual per-item admin endpoint | `newsItem.model.ts:7`, `newsItem.service.ts:124-127`, `scheduler.ts` (3 jobs: ingestion, analytics, auto-generation — no cleanup) |
| **Engagement and `trend_score` are frozen at ingest.** Written once in the pipeline payload, never refreshed. "Out of trend" is undetectable with current data | `newsIngestion.service.ts:229-251` |
| `scoreTrend(points, comments, starsDelta)` is a pure fn: `log10(points + 2·comments + 3·stars + 1) × 3`, clamped to 10, rounded to 0.1 | `newsIngestion.scoring.ts:28-31` |
| The same weighting (`points + 2·comments + 3·stars`) exists as `engagementWeight` in dedup | `newsIngestion.utils.ts:51` |
| **GitHub Trending scrape-path items still have `published_at: undefined`** (only the Search-API path sets it from `created_at`). `filterFresh` treats missing dates as fresh, so a deleted scrape-path repo that still trends **re-ingests on the very next run** — the resurrection hazard is real and current | `adapters/githubTrending.ts:56` (scrape), `:120` (API), `newsIngestion.utils.ts:21-24` |
| `dedupeAgainstStored` is one `$in` query on `NewsItem` by `content_hash` + an in-run `Set` | `newsIngestion.utils.ts:30-43` |
| `fetchRecentEmbeddings` filters `published_at: { $gte: cutoff }` (72 h window) — GH scrape items are excluded from the semantic pool | `newsIngestion.utils.ts:46-49` |
| **Reddit adapter is now OAuth** (client-credentials, token cached in Redis under `reddit:app_token`); `getAppToken` is module-private (not exported); `source_id` is the bare post id (no `t3_` prefix) | `adapters/reddit.ts:51-59`, `:76` |
| HN adapter: `source_id = String(item.id)`; re-fetch endpoint is `https://hacker-news.firebaseio.com/v0/item/{id}.json` (already used at ingest) | `adapters/hackerNews.ts:24,34` (note filename casing: `hackerNews.ts`) |
| dev.to adapter: `source_id = String(article.id)`; re-fetch endpoint is `https://dev.to/api/articles/{id}` | `adapters/devto.ts:43` |
| `IngestionRun` model exists with a 30-day TTL index — the established pattern for self-cleaning job history | `IngestionRun/ingestionRun.model.ts:30` |
| Feed endpoint `GET /news-items` uses `QueryBuilder`; `filter()` copies all non-reserved query params straight into the Mongo filter (so a `?lifecycle=...` param works with zero code once the field exists); **default sort is `'-createdAt'` — a field that does not exist on `news_items`** (the schema uses `created_at`, no `timestamps` option), so the feed currently has no meaningful default order | `builder/QueryBuilder.ts:53,58`, `newsItem.model.ts:33`, `newsItem.service.ts:57-61` |
| `getAllNewsItemsValidation` whitelists query keys `team_id, search, category, sort, page, limit`; `updateNewsItemValidation` does **not** include `lifecycle` — both need extending | `newsItem.validation.ts:24-49` |
| Admin restore path already exists structurally: `PATCH /news-items/:id` (requireAuth+requireAdmin) → `findByIdAndUpdate` | `newsItem.route.ts:39-45`, `newsItem.service.ts:116-122` |
| `news_item_category_overrides`: `{ news_item_id: String, team_id, overridden_at, … }`, unique compound index — orphaned on item delete unless cascaded | `newsItemCategoryOverride.model.ts:4-14` |
| Content generation soft-fails on missing `news_item_id` (falls back to topic text) — deleting referenced items is safe there | `contentGeneration.service.ts:31-47` |
| Report opportunities read `NewsItem.find({ processed: true }).sort({ created_at: -1 }).limit(50)` and use `trend_score` | `report.opportunities.ts:41-44,64` |
| Chat retrieval reads `NewsItem.find({}).sort({ trend_score: -1 }).limit(30)` — **plain Mongo query + in-app cosine, NOT Atlas `$vectorSearch`** | `chat.retrieval.ts:58-63` |
| Auto-generation picks `NewsItem.find().sort({ opportunity_score: -1, trend_score: -1 }).limit(3)` per team | `generatedContent.job.ts:40-42` |
| Redis client is ioredis (`redis.set(key, val, 'PX', ms, 'NX')` is the lock idiom); already a hard dependency | `lib/redis.ts:5` |
| Config pattern: zod `envSchema` (strings with `.default()`/`.optional()`), `superRefine` for cross-field checks (opportunity weights already use it), `Number(...)` in the exported object | `config/index.ts:17-113,188-211` |
| Scheduler pattern: one `startXScheduler` export per job, whole callback try/caught, `node-cron`, in-process | `lib/scheduler.ts:13-24` |
| `openspec/specs/` is still **empty** (no change has ever been synced) — spec deltas have no main spec to diff against; write full restated requirements | `openspec/specs/` |
| `story_id` / story chains do **not** exist anywhere in the codebase (Problem 4 not yet implemented) | grep confirms |

### 0.2 Corrections to FARSIT-NEWS-PIPELINE-RETENTION.md (do not copy these parts of the deep-dive)

1. **No Atlas vector-index migration is needed.** The deep-dive (§5) says chat retrieval uses the `news_items_vector_index` Atlas index and requires adding a `lifecycle` filter field + index re-creation. **False today:** the index is created by `src/scripts/createVectorIndexes.ts` but no app code queries it — `chat.retrieval.ts` uses a plain `find()` + in-app cosine. The lifecycle filter for chat is a one-line change to that `find()`. Drop the index-migration step entirely (if `$vectorSearch` is adopted later, that change owns the filter-field migration).
2. **The feed's "default sort" is currently broken, not merely stale-biased.** `QueryBuilder.sort()` defaults to `-createdAt`, which doesn't exist on this schema. Changing the default to the decayed score isn't a behavior regression risk — it's the first time the feed default sort does anything at all.
3. **Reddit re-poll must go through the OAuth adapter's token machinery** (deep-dive predates the OAuth change). `getAppToken` in `adapters/reddit.ts` needs exporting; `/api/info` ids need the `t3_` fullname prefix added to the stored bare `source_id`.
4. **Trend-floor archiving must not apply to engagement-less sources** (`rss:*`, and any item whose engagement is all zeros). Their `scoreTrend` base is 0, so their decayed score is 0 from birth — a naive floor rule would archive every RSS/Medium item at exactly the min-age boundary, quietly undoing the "Medium missing" fix that just shipped. See Change R2/R4 design decisions for the rule that replaces the deep-dive's blanket floor.
5. **Backfill is folded into the retention job** (idempotent `updateMany` at job start), not a separate operator-run migration — one less thing to forget in production.

### 0.3 Interlocks with the sibling plans (who owns what)

The new-sources plan (Problem 2) and the future story-chain work (Problem 4) both touch retention. Each interlock below states the design consequence for **this** plan and the obligation handed to the **other** plan — encode these in the proposals so the plans can execute in any interleaving without rework.

**A. Seven new adapters are coming (new-sources plan Changes 1–7: lobsters, HN-Algolia migration, mastodon, rss-fleet, producthunt, stackoverflow, google_news).**
- R1's refresh job MUST NOT hardcode the refreshable-source list. It is built as a **fetcher registry** (`ENGAGEMENT_FETCHERS: Record<string, EngagementFetcher>`, R1 design decision 8) seeded with `hackernews`, `reddit`, `devto`. A future source gains re-polling by registering one fetcher — no job changes. Candidate queries derive their `source $in` list from `Object.keys(ENGAGEMENT_FETCHERS)`.
- Ready-made future registrations (documented, NOT tasks of this plan): lobsters `GET https://lobste.rs/s/{short_id}.json` (`score`/`comment_count`); stackoverflow `GET https://api.stackexchange.com/2.3/questions/{ids}?site=stackoverflow` (semicolon-batched, ≤100/req); producthunt GraphQL `node(id:…){ votesCount commentsCount }`. Mastodon, google_news, and `rss:*` have no re-fetch signal — never register them.
- The **engagement-signal rule** (R2 `hasEngagementSignal`, used by R4's trend-floor guard) is `source ∈ registry keys OR latest weighted engagement > 0`. Compatibility check against all seven upcoming sources: lobsters/stackoverflow/producthunt/mastodon ingest with nonzero `raw_points` → floor-eligible (correct — they have a real trend base that can collapse); google_news, arXiv/release feeds, and other `rss:*` ingest with zero engagement → exempt from the floor, aged out by the 96 h ceiling only (correct — archiving them at the 36 h line would gut the editorial sources Problem 2 exists to add). **No retention change is needed when any of the seven ships.**
- The HN-Algolia migration (new-sources Change 2) keeps `source: 'hackernews'` and numeric ids, so R1's Firebase per-item re-fetch keeps working unchanged through it. Batch re-fetch via Algolia (`search?tags=story_X`) is a later optimization, not a dependency in either direction.
- Mastodon items carry `published_at = fetch time` (by that plan's design) — R2's age term (`published_at ?? created_at`) and R4's `created_at`-based ceiling both handle that correctly with no special case.

**B. Story chains (`story_id`) arrive with Problem 4 (dedup-updates doc §4) — after this plan.** Obligations handed to that plan, stated here so R4's spec doesn't have to be reopened blind:
- **Archive protection:** Problem 4 MUST add one clause to R4's Stage-1 archive query — skip items whose `story_id` has ANY member that is `lifecycle: 'active'` with `current_trend_score ≥ NEWS_ARCHIVE_TREND_FLOOR` (dedup doc §4 "a story is retired as a unit"). R4 structures its archive query as a composable list of guard clauses (R4 design decision 8) precisely so this lands as one addition.
- **Whole-story archival:** when a story goes cold, all chapters archive together, and R4's Stage 2 must tombstone **every chapter's** `content_hash` (it already tombstones per-item, so this follows automatically from archiving chapters together — state it in Problem 4's verification, not here).
- **Corroborations** (dedup doc §3.3): duplicate drops will merge engagement into the stored item and recompute its `current_trend_score` — which is why R2 exports `computeCurrentTrendScore` as a pure function (R2 design decision 5); Problem 4 calls it, never re-implements it.

**C. Same-URL re-surfacing engagement refresh at hash-dedup** (dedup doc §5: a `github_trending` repo re-entering trending is an update with an identical URL — refresh the stored item's engagement instead of plain-skipping). **Owned by Problem 4's plan, not this one.** R1 therefore deliberately does NOT re-poll `github_trending` (no per-item endpoint fits the budget; the hash-dedup hook is the right mechanism and it belongs with the dedup rework). Until Problem 4 ships, GH items decay on age alone — acceptable, since the max-age ceiling still bounds them.

### 0.4 Global conventions for all 4 changes

1. **Capability naming:** reuse `news-ingestion` for pipeline-behavior deltas (established by the archived changes). New capabilities introduced by this plan: `engagement-refresh` (Changes R1–R2) and `news-retention` (Changes R3–R4). `ingestion-observability` already exists — do not fork it; the new jobs get their own run history (see R1 decision 5).
2. **Spec-delta form:** `openspec/specs/` is empty, so write requirements as full restated text with `#### Scenario:` blocks (the archived changes all did this) — never bare diff fragments.
3. **Env-var rule (hard requirement):** every new env var is optional-with-safe-default in the zod schema; **the server must boot with none of them set.** Document each in `backend/.env.example`. New vars go in both `envSchema` and the exported `news_ingestion`/new config block in `config/index.ts`.
4. **All timestamps UTC / epoch arithmetic** (`Date.now()`-based, matching `filterFresh`) — never format/parse local dates.
5. **Every scheduled job body takes a Redis lock** (`SET key <id> PX <ttl> NX`, ioredis positional form) so a second instance can't run deletion/refresh concurrently (master doc §5.5 — duplicate ingestion is merely wasteful; duplicate deletion is not).
6. **Job failure discipline:** a failed refresh/retention run must never crash the API server (scheduler try/catch pattern) and must never fail the data it was operating on into a half-state — batch boundaries are the atomicity unit, and the tombstone-before-delete ordering (R4) makes a mid-cascade crash harmless.
7. **Out of scope for this plan** (belongs to other problems — do not sneak them in): story chains / `story_id`, two-band semantic dedup / LLM adjudication, corroborations, the hash-dedup same-URL engagement-refresh hook (§0.3.C), changing `content_hash` semantics, changing the 0.88 threshold, new sources, Atlas `$vectorSearch` adoption. Forward obligations to Problem 4 are enumerated in §0.3.B — restate them in the R4 proposal's out-of-scope section so `/opsx:propose` records them.

### 0.5 Change map & dependency order

```
R1 engagement-refresh-job      — re-poll engagement, engagement_history, source_removed
        │
R2 trend-decay-scoring         — current_trend_score + feed/chat/report ranking (needs R1's history for velocity)
        │
R3 dedup-tombstone-ledger      — independent; may be built in parallel with R1/R2, but MUST be archived before R4
        │
R4 news-retention-lifecycle    — archive + hard-delete jobs (needs R2's score for the floor rule, R3's ledger for Stage 2)
```

One OpenSpec change at a time: propose → validate (`openspec validate <id> --strict` if available) → apply → verify → archive, then the next. R3 may be proposed while R1/R2 are in flight, but R4 must not be **proposed** until R1–R3 are archived (its spec references their artifacts).

---

## Change R1 — `engagement-refresh-job`

**Master doc:** Phase 3.1. **Deep-dive:** §3.
**Unblocks:** trend decay (R2) and therefore "out of trend" detection (R4). **Effort:** ~1 day. **Schema change: 3 new optional fields on `news_items` + 1 new collection (`maintenance_runs`).**

### Proposal input (for `/opsx:propose`)

**Why:** An item's engagement (`points`, `comments`, `stars_delta`) and `trend_score` are written once at ingest (`newsIngestion.service.ts:229-251`) and never touched again. An item that exploded an hour after ingestion and an item that died immediately are indistinguishable forever, which makes the reported requirement — "delete immediately when out of trend" — impossible: there is no trend signal to act on. HN, Reddit, and dev.to all support cheap re-fetch by the `source_id` we already store; re-polling them on a schedule creates the engagement time-series every later retention decision depends on.

**What changes:**
- New scheduled job `runEngagementRefresh` (own cron, default `NEWS_REFRESH_CRON=30 * * * *` — hourly at :30, offset from ingestion's `0 */3` so they never stack), following the existing `scheduler.ts` pattern, body wrapped in a Redis lock.
- Scope per run: items with `created_at` within the last `NEWS_REFRESH_WINDOW_HOURS` (default 96) from sources that support re-fetch (`hackernews`, `reddit`, `devto`), youngest first, capped at `NEWS_REFRESH_MAX_REQUESTS` (default 200) HTTP requests per run. `github_trending` and `rss:*` are skipped (no re-fetch signal; GH stars-delta refresh arrives free via ingestion when a repo re-trends — but note it's hash-deduped, so in practice GH items decay on age, which is acceptable).
- Per item refreshed: overwrite `engagement.{points,comments,stars_delta}` with current values, push `{ at, points, comments, stars_delta }` onto new `engagement_history` array (`$push` with `$slice: -32`), set `engagement_refreshed_at`. **`trend_score` stays frozen** — it is the ingest-time snapshot; the decayed live score is R2's separate field.
- A 404/410 on re-fetch (post removed at the source) sets new field `source_removed: true` — a strong out-of-trend signal consumed by R4. **Never delete on 404** (removal at the source doesn't retroactively unpublish content a team generated from it).
- Per-source fetchers live in a **registry** `ENGAGEMENT_FETCHERS: Record<string, EngagementFetcher>` (the job iterates registry keys; adding a re-pollable source later = one registry entry, zero job changes — §0.3.A). Seed entries: HN — `GET https://hacker-news.firebaseio.com/v0/item/{source_id}.json` (1 req/item; same endpoint the adapter already uses; unaffected by the planned Algolia adapter migration, which keeps ids and the `hackernews` label). Reddit — `GET https://oauth.reddit.com/api/info?id=t3_{id1},t3_{id2},…` batched 100 fullnames per request, using the existing OAuth token cache (export `getAppToken` from `adapters/reddit.ts`); skip Reddit refresh entirely (with a logged reason) when `REDDIT_CLIENT_ID`/`SECRET` unset. dev.to — `GET https://dev.to/api/articles/{source_id}` (1 req/item). `github_trending` is deliberately NOT registered (§0.3.C — its refresh mechanism belongs to Problem 4's hash-dedup hook); `rss:*`, and future no-signal sources (mastodon, google_news), never register.
- New `maintenance_runs` collection (model `MaintenanceRun`, mirroring `IngestionRun`'s shape and 30-day TTL): one document per refresh run — `{ job: 'engagement_refresh', started_at, finished_at, duration_ms, counts: { candidates, refreshed, source_removed, request_count, errors }, error? }`. R4 reuses this collection with `job: 'retention'`. Persistence failure never fails the job (copy `persistRun`'s try/catch discipline, `newsIngestion.service.ts:135-159`).

**Capabilities:** ADDED `engagement-refresh`.

**Impact:**
- New: `backend/src/app/modules/NewsRefresh/` (`newsRefresh.service.ts`, `newsRefresh.fetchers.ts`), `backend/src/app/modules/MaintenanceRun/` (`maintenanceRun.interface.ts`, `maintenanceRun.model.ts`).
- `backend/src/app/modules/NewsItem/newsItem.model.ts` + `newsItem.interface.ts` — `engagement_history`, `engagement_refreshed_at`, `source_removed` (all optional; `source_removed` defaults `false`).
- `backend/src/app/modules/NewsIngestion/adapters/reddit.ts` — export `getAppToken` (no behavior change).
- `backend/src/app/lib/scheduler.ts` — `startEngagementRefreshScheduler`; wire it wherever the other three schedulers are started (`server.ts` / `app.ts` — find the existing call site and mirror it).
- `backend/src/app/config/index.ts` + `backend/.env.example` — `NEWS_REFRESH_CRON=30 * * * *`, `NEWS_REFRESH_WINDOW_HOURS=96`, `NEWS_REFRESH_MAX_REQUESTS=200`.

### Design decisions

1. **Request budget & prioritization:** the candidate query sorts `created_at: -1` (youngest first — they change fastest and inform the most imminent decisions). HN and dev.to cost 1 request/item; Reddit costs `ceil(n/100)`. Walk candidates youngest-first, decrementing the budget by actual request cost; stop at the cap. With defaults (~30 HN + ~50 dev.to + ~75 Reddit per ingestion run, 96 h window) the youngest few hours always fit; older items get refreshed less often — exactly the right degradation.
2. **Reddit fullnames:** stored `source_id` is the bare id (`adapters/reddit.ts:76`); the info endpoint needs `t3_` prefixes. Build `id=t3_a,t3_b,…`. Response is a standard listing; map by stripping the prefix back off `data.name` (do NOT rely on response order).
3. **Failure isolation:** one source's refresh failing (e.g. Reddit token failure) must not stop HN/dev.to refresh — per-source try/catch, error strings recorded in the run doc's `counts.errors`/`error`. A single item's fetch failure is logged and skipped.
4. **`$slice: -32` snapshot cap:** hourly for 96 h is 96 snapshots; keeping the most recent 32 (~32 h of history) is plenty for velocity (R2 needs only the last two) while bounding document growth. Do not implement tiered sampling — not worth it.
5. **Why a new `maintenance_runs` collection instead of reusing `ingestion_runs`:** `IngestionRun.trigger` is a closed enum `['cron','manual']` and its `sources` array shape is ingestion-layer-specific (`ingestionRun.model.ts:4-26`). Overloading it would corrupt the zero-streak endpoint's semantics. A sibling collection with the same TTL discipline is cheaper than bending the existing one.
6. **Redis lock:** `redis.set('lock:news_refresh', runId, 'PX', 55*60*1000, 'NX')` — if not acquired, log + return. Release with a compare-and-delete only if value matches (or just let it expire; the PX is shorter than the cron period, which is sufficient here — choose expire-only for simplicity and say so in a comment).
7. **`engagement_history` also gets the ingest-time snapshot** pushed as its first entry by the refresh job on first touch (from the stored `engagement`), so velocity is computable after a single refresh instead of two.
8. **Fetcher-registry contract** (`newsRefresh.fetchers.ts`): `type EngagementFetcher = (items: { _id; source_id }[]) => Promise<{ source_id: string; points: number; comments: number; stars_delta: number; removed: boolean; requests_used: number }[]>` — each fetcher owns its own batching (Reddit 100-chunk) and reports actual request cost so the budget walk stays accurate across differently-priced sources. Export `ENGAGEMENT_FETCHERS` and its key list; R2's `hasEngagementSignal` and R4's archive query import the keys instead of repeating source names (single source of truth — §0.3.A). Ready-made future entries for lobsters / stackoverflow / producthunt are documented in §0.3.A; do NOT implement them in this change.

### Spec delta (capability `engagement-refresh`, ADDED)

```markdown
## ADDED Requirements

### Requirement: Scheduled Engagement Re-Polling
The system SHALL run a scheduled engagement-refresh job (cron `NEWS_REFRESH_CRON`,
default hourly at minute 30, Redis-locked so concurrent instances no-op) that
re-fetches current engagement for stored news items from sources with a
registered engagement fetcher (initially hackernews, reddit, devto; the
registry is the extension point for future sources), scoped to items created within
`NEWS_REFRESH_WINDOW_HOURS` (default 96) and capped at
`NEWS_REFRESH_MAX_REQUESTS` (default 200) HTTP requests per run, prioritizing
the youngest items. For each refreshed item the system SHALL overwrite the
stored engagement counts, append a timestamped snapshot to `engagement_history`
(bounded to the most recent 32 snapshots), and set `engagement_refreshed_at`.
The ingest-time `trend_score` SHALL remain unchanged by refresh.

#### Scenario: HN item is refreshed
- **WHEN** the refresh job processes a hackernews item whose story now has more points and comments
- **THEN** the item's `engagement.points`/`engagement.comments` reflect the new values and `engagement_history` gained a snapshot with those values and the refresh time

#### Scenario: Reddit items are batch-fetched
- **WHEN** 150 reddit items are in scope
- **THEN** the job issues 2 requests to `oauth.reddit.com/api/info` with `t3_`-prefixed fullnames (100 per request) using the cached OAuth app token

#### Scenario: Reddit credentials absent
- **WHEN** REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET is unset
- **THEN** the job skips reddit items with a logged reason and still refreshes hackernews and devto items

#### Scenario: Request budget respected
- **WHEN** in-scope items would require more than `NEWS_REFRESH_MAX_REQUESTS` requests
- **THEN** the job stops issuing requests at the cap, having processed the youngest items first

#### Scenario: Unsupported sources are skipped
- **WHEN** items from `rss:*` or `github_trending` are within the window
- **THEN** the job does not issue any request for them

### Requirement: Source Removal Detection
When a re-fetch returns HTTP 404 or 410, or the source API reports the item
deleted/removed, the system SHALL set `source_removed: true` on the item and
SHALL NOT delete it.

#### Scenario: Deleted HN story
- **WHEN** the item endpoint returns `null`/404 for a stored hackernews item
- **THEN** the item is marked `source_removed: true` and remains in the collection

### Requirement: Refresh Run History
Each refresh run SHALL persist one `maintenance_runs` document
(`job: 'engagement_refresh'`) with timings and counts (candidates, refreshed,
source_removed, request_count, per-source errors). Persistence failure SHALL NOT
fail the refresh. Documents SHALL expire after 30 days.

#### Scenario: Run summary persisted
- **WHEN** a refresh run completes
- **THEN** a maintenance run document exists with `job: 'engagement_refresh'` and consistent counts

#### Scenario: Lock prevents concurrent runs
- **WHEN** a refresh run is already holding the Redis lock
- **THEN** a second invocation exits without fetching or writing anything
```

### Tasks

```markdown
## 1. Schema
- [ ] 1.1 Add to `newsItem.interface.ts` + `newsItem.model.ts`: `engagement_history?: { at: Date; points: number; comments: number; stars_delta: number }[]`, `engagement_refreshed_at?: Date`, `source_removed: { type: Boolean, default: false }`

## 2. Config
- [ ] 2.1 envSchema: `NEWS_REFRESH_CRON` default `'30 * * * *'`, `NEWS_REFRESH_WINDOW_HOURS` default `'96'`, `NEWS_REFRESH_MAX_REQUESTS` default `'200'`; export under `news_ingestion.refresh: { cron, window_hours, max_requests }`; document all three in `.env.example`

## 3. MaintenanceRun model
- [ ] 3.1 `backend/src/app/modules/MaintenanceRun/`: interface + model (`job: { type: String, enum: ['engagement_refresh', 'retention'] }`, started_at/finished_at/duration_ms, `counts: Schema.Types.Mixed` or explicit numeric subdoc, optional `error`); TTL index `{ started_at: 1 }, { expireAfterSeconds: 2592000 }`; collection name `maintenance_runs`

## 4. Refresh service
- [ ] 4.1 Export `getAppToken` from `adapters/reddit.ts` (rename nothing else)
- [ ] 4.2 `newsRefresh.fetchers.ts`: `ENGAGEMENT_FETCHERS` registry (design decision 8) with the three seed fetchers — HN per-item, Reddit (t3_ prefixing, 100-chunk, token via getAppToken, map by `data.name`, credential-gated skip), dev.to per-item; each returns records incl. `removed` + `requests_used`; per-call catch → logged skip; export the registry and `REFRESHABLE_SOURCES = Object.keys(ENGAGEMENT_FETCHERS)`
- [ ] 4.3 `newsRefresh.service.ts` `runEngagementRefresh()`: Redis lock (`lock:news_refresh`, PX 55min, NX → skip if held); candidate query `{ created_at: { $gte: windowCutoff }, source: { $in: REFRESHABLE_SOURCES }, ...(R4 shipped: lifecycle active — leave a TODO, do NOT reference lifecycle yet) }` sorted `created_at: -1`, projected `_id source source_id engagement`; budget walk (decrement by each fetcher's reported `requests_used`); bulk updates: `$set` engagement + engagement_refreshed_at, `$push: { engagement_history: { $each: [snapshot], $slice: -32 } }`; first-touch: prepend ingest-time snapshot; 404/removed → `$set: { source_removed: true }`; persist MaintenanceRun in try/catch
- [ ] 4.4 `scheduler.ts`: `startEngagementRefreshScheduler` (copy the existing pattern verbatim); call it next to the other `startXScheduler` calls at the server bootstrap call site

## 5. Tests (follow existing `backend/src/__tests__/` patterns: mocked fetch/redis, mongodb-memory-server for integration)
- [ ] 5.1 Unit: reddit fullname prefixing + 100-chunking + response mapped by `data.name` not order
- [ ] 5.2 Unit: budget cap stops requests; youngest-first ordering
- [ ] 5.3 Integration: refresh updates engagement + history (with $slice cap) + engagement_refreshed_at; 404 sets source_removed without delete; run doc persisted; lock held → no-op

## 6. Verification
- [ ] 6.1 `cd backend && npm run build` passes; server boots with no NEWS_REFRESH_* vars set
- [ ] 6.2 Ingest (manual trigger), wait for/trigger a refresh run: HN/dev.to items show `engagement_refreshed_at` + ≥2 history snapshots (ingest snapshot + refresh); reddit too if credentials configured
- [ ] 6.3 `db.maintenance_runs.find()` shows the run with sane counts and the TTL index exists
```

**Pitfalls:** don't touch `trend_score`; don't reference `lifecycle` (doesn't exist until R4 — leave the TODO); the HN adapter file is `hackerNews.ts` (camelCase N) — imports are case-sensitive on CI even though Windows tolerates it; Reddit `/api/info` returns items in arbitrary order.

---

## Change R2 — `trend-decay-scoring`

**Master doc:** Phase 3.2–3.3. **Deep-dive:** §4. **Depends on:** R1 (velocity needs `engagement_history`; ships fine before R1 data exists — velocity term is just 0 until history accrues).
**Effort:** ~1 day. This change alone solves most of the *perceived* problem ("old news pollutes the feed") before any deletion ships.

### Proposal input

**Why:** `trend_score` is an ingest-time snapshot, and the feed's default sort (`-createdAt`) references a field that doesn't exist on the schema (`news_items` uses `created_at`), so the feed has no meaningful default order at all. With engagement history now being collected (R1), a decayed, velocity-aware live score can be computed and stored, giving the feed, chat retrieval, reports, and auto-generation a signal that makes stale items sink automatically — and giving retention (R4) the "out of trend" trigger the reported problem asks for.

**What changes:**
- New pure function `computeCurrentTrendScore` in `newsIngestion.scoring.ts` (beside `scoreTrend`):
  ```
  base      = scoreTrend(latest points, comments, stars_delta)        // existing fn, 0–10
  ageHours  = (now − (published_at ?? created_at)) / 3_600_000
  decay     = exp(−ageHours / NEWS_TREND_DECAY_TAU_HOURS)             // default TAU 36
  velocity  = history.length ≥ 2
              ? max(0, (w(last) − w(prev)) / max(hoursBetween(last, prev), 1))
              : 0                                                      // w = points + 2·comments + 3·stars
  score     = round1(clamp(base·decay + NEWS_TREND_VELOCITY_BONUS·log10(1 + velocity), 0, 10))
  ```
- New stored field `current_trend_score` (Number, plain index) — set at ingest (age≈0 ⇒ ≈`trend_score`) and recomputed for every item the R1 refresh job touches (whether or not the source returned new numbers — decay advances with time). Never computed per-request.
- New derived boolean helper `hasEngagementSignal(item)`: true iff the item's source has a registered engagement fetcher (`REFRESHABLE_SOURCES` from R1 — single source of truth) OR its latest weighted engagement > 0 (covers GH star deltas, and automatically classifies every upcoming source correctly — §0.3.A compatibility table). Exported for R4; **not stored**.
- Ranking consumers switch to the live score with a stored-snapshot fallback for pre-backfill rows (`current_trend_score ?? trend_score`):
  - Feed default sort becomes `-current_trend_score -created_at` when the client sends no `?sort` (explicit `?sort=` still wins — contract unchanged).
  - `chat.retrieval.ts` pool sort `{ trend_score: -1 }` → `{ current_trend_score: -1 }`.
  - `report.opportunities.ts` scoring uses `current_trend_score ?? trend_score`; add `current_trend_score` to its `.select()`.
  - `generatedContent.job.ts` sort gains `current_trend_score: -1` ahead of `trend_score: -1`.
- One-time backfill, embedded idempotently at the start of the refresh job: `NewsItem.updateMany({ current_trend_score: { $exists: false } }, [{ $set: { current_trend_score: '$trend_score' } }])` (aggregation-pipeline update).

**Capabilities:** MODIFIED `engagement-refresh` (refresh recomputes the score); ADDED requirement under `engagement-refresh` for the score itself and ranking consumption.

**Impact:**
- `newsIngestion.scoring.ts` — `computeCurrentTrendScore`, `hasEngagementSignal`.
- `newsIngestion.service.ts` — payload gains `current_trend_score` (`:229-251` region).
- `newsItem.model.ts`/`interface` — field + index.
- `NewsRefresh/newsRefresh.service.ts` — recompute+`$set` per touched item; backfill statement.
- `newsItem.service.ts:57-61` — default-sort injection; `chat.retrieval.ts:58-63`; `report.opportunities.ts:41-65`; `generatedContent.job.ts:40-42`.
- `config/index.ts` + `.env.example` — `NEWS_TREND_DECAY_TAU_HOURS=36`, `NEWS_TREND_VELOCITY_BONUS=2`.

### Design decisions

1. **Zero-engagement sources score 0 and that is intentional** — `scoreTrend(0,0,0)` = 0, so `rss:*` items have `current_trend_score` 0 from birth. Consequences handled deliberately: (a) feed default sort uses `-created_at` as the tie-break so fresh editorial items order sensibly among themselves; (b) the archive **floor rule in R4 only applies where `hasEngagementSignal` is true** — otherwise every Medium/RSS item would be archived at the minimum age, silently undoing the just-shipped "Medium missing" fix. If product later wants RSS items interleaved higher in the feed, that's a ranking-blend feature, not retention — out of scope.
2. **Recompute sites are exactly two:** ingest (initial value) and the refresh job (R1). The retention job (R4) reads the stored value; it does not recompute. Items older than the 96 h refresh window keep their last computed value — fine, because past 96 h the max-age ceiling decides, not the score.
3. **Defaults calibration:** TAU=36 h ⇒ a zero-velocity item's score halves every ~25 h; an item ingested at `trend_score` 6 crosses the R4 floor (2.0) at ~40 h; at 8 it crosses at ~50 h. So "out of trend → archived" lands naturally in the 1.5–3 day band, and the 96 h ceiling catches everything else — matching "3–4 days" by construction. Say this in the spec's rationale but do NOT encode the example numbers as scenarios (they'd break on any tuning).
4. **Fallback expression, not migration dependency:** every read site uses `current_trend_score ?? trend_score` (or a Mongo `$ifNull` where it's inside a query/sort — for the feed sort, missing values sort last, which combined with the backfill-in-job means at most one refresh-cycle of odd ordering after deploy). Keep the backfill anyway for index selectivity.
5. **`round1` + clamp to 0–10** — same conventions as every other score in `newsIngestion.scoring.ts`. **Keep `computeCurrentTrendScore` pure and exported:** Problem 4's corroboration merge (dedup doc §3.3) will recompute a stored item's score after absorbing a duplicate's engagement by calling this exact function — it must never grow hidden dependencies on the refresh job's context.

### Spec delta (capability `engagement-refresh`)

```markdown
## ADDED Requirements

### Requirement: Decayed Current Trend Score
The system SHALL maintain a stored `current_trend_score` (0–10) on every news
item: computed at ingest and recomputed for every item the refresh job touches,
as the ingest-formula trend base times an exponential age-decay factor
(`exp(−age_hours / NEWS_TREND_DECAY_TAU_HOURS)`, default TAU 36, age measured
from `published_at` falling back to `created_at`), plus a bounded velocity bonus
(`NEWS_TREND_VELOCITY_BONUS × log10(1 + max(0, Δweighted_engagement/hour))`,
default bonus 2) derived from the two most recent engagement-history snapshots,
clamped to [0, 10]. The score SHALL never be computed per-request. Items with no
engagement signal decay from a base of zero.

#### Scenario: Score decays with age
- **WHEN** an item's engagement is unchanged across two refresh runs
- **THEN** its `current_trend_score` after the later run is lower than after the earlier run

#### Scenario: Rising story resists decay
- **WHEN** an item's engagement grew between the last two snapshots
- **THEN** its recomputed score includes a positive velocity bonus

#### Scenario: Ingest-time initialization
- **WHEN** a new item is stored by the ingestion pipeline
- **THEN** it has a `current_trend_score` approximately equal to its `trend_score`

### Requirement: Ranking Consumes the Live Score
Feed listing (`GET /news-items` with no explicit `sort`), chat news-context
pooling, report opportunity scoring, and auto-generation candidate selection
SHALL rank by `current_trend_score` (falling back to `trend_score` for
not-yet-backfilled rows), with `created_at` (descending) as the feed tie-break.
An explicit `?sort=` on the feed SHALL still be honored unchanged.

#### Scenario: Stale item sinks from feed page 1
- **WHEN** the feed is requested with no sort parameter and the collection holds a 4-day-old high-ingest-score item plus fresher items with nonzero scores
- **THEN** the stale item does not rank above the fresher items

#### Scenario: Explicit sort untouched
- **WHEN** a client requests `?sort=-created_at`
- **THEN** results are ordered by that expression exactly as before
```

### Tasks

```markdown
## 1. Scoring
- [ ] 1.1 `computeCurrentTrendScore(item, now)` + `hasEngagementSignal(item)` in `newsIngestion.scoring.ts` per the formula (pure, exported); config plumb `NEWS_TREND_DECAY_TAU_HOURS=36`, `NEWS_TREND_VELOCITY_BONUS=2` (envSchema + `news_ingestion` export + `.env.example`)
- [ ] 1.2 Unit tests: decay monotonicity; velocity bonus from history; clamp/round; empty-history velocity 0; zero-engagement base 0; published_at-missing falls back to created_at

## 2. Storage
- [ ] 2.1 `current_trend_score: { type: Number, index: true }` on model + interface
- [ ] 2.2 Ingestion payload sets it (call computeCurrentTrendScore at store time)
- [ ] 2.3 Refresh job (R1 service): recompute + `$set` for every touched item; add the idempotent backfill `updateMany` (aggregation-pipeline `$set` from trend_score) at job start
- [ ] 2.4 Integration test: two refresh cycles with static mocked engagement → score strictly decreases

## 3. Consumers
- [ ] 3.1 `newsItem.service.ts` getAllNewsItems: if `remainingQuery.sort` is absent, set it to `'-current_trend_score -created_at'` before constructing QueryBuilder (do not modify QueryBuilder itself — other modules share it)
- [ ] 3.2 `chat.retrieval.ts`: pool sort → `{ current_trend_score: -1 }`, add field to projection
- [ ] 3.3 `report.opportunities.ts`: select + use `current_trend_score ?? trend_score`
- [ ] 3.4 `generatedContent.job.ts`: sort `{ opportunity_score: -1, current_trend_score: -1, trend_score: -1 }`
- [ ] 3.5 Frontend `frontend/src/lib/api/types.ts`: add optional `current_trend_score` to the NewsItem type (display changes not required)

## 4. Verification
- [ ] 4.1 build + lint pass (backend & frontend); server boots with no new vars
- [ ] 4.2 Live: ingest, run refresh twice (or shrink TAU locally), confirm feed page 1 ordering shifts toward fresher/rising items and `GET /news-items?sort=-created_at` is unchanged
```

**Pitfalls:** feed default-sort injection must happen before `QueryBuilder` sees the query (its `sort()` default is the broken `-createdAt`); don't add `current_trend_score` to `updateNewsItemValidation` (it's system-maintained); velocity uses **history snapshots**, never `Date.now()` minus ingest.

---

## Change R3 — `dedup-tombstone-ledger`

**Master doc:** Phase 4.1. **Deep-dive:** §6. **Independent of R1/R2 — may be built in parallel; must be archived before R4.**
**Effort:** ~half a day. **Blocks the resurrection loop — mandatory before any bulk delete ships.**

### Proposal input

**Why:** The unique `content_hash` on `news_items` is the only thing preventing re-ingestion of a URL (`dedupeAgainstStored`, `newsIngestion.utils.ts:30-43`). Deleting a row deletes the hash with it. GitHub-Trending scrape-path items have `published_at: undefined` (`adapters/githubTrending.ts:56`) and therefore bypass the freshness filter entirely — a deleted repo that still trends is guaranteed to re-ingest on the next run, get re-embedded and re-categorized (LLM cost), and reappear in the feed as "new." The manual admin delete endpoint (`DELETE /news-items/:id`) has this hazard **today**; the bulk retention delete (R4) would industrialize it. Deleted hashes must survive their rows.

**What changes:**
- New collection `news_dedup_ledger` (model `NewsDedupLedger`): `{ content_hash: { unique }, title, source, deleted_at: TTL-indexed }`, TTL from `NEWS_DEDUP_LEDGER_TTL_DAYS` (default 30). **No embeddings** in the ledger (deep-dive §6 recommendation: hash-dedup alone stops exact resurrection; the semantic pool's 72 h window barely overlaps the archive ages; revisit only if run history shows paraphrase re-admission).
- Exported helper `recordTombstones(items: { content_hash, title, source }[])` — upsert-style bulk insert (`ordered: false`, duplicate-key tolerated) so retries/crashes are idempotent.
- `dedupeAgainstStored` additionally checks the ledger: second `$in` query on `NewsDedupLedger`, results unioned into the existing exclusion set. Ledger read failure → log + proceed with news-items-only dedup (fail open on *dedup*, never on *storage*).
- Manual admin delete (`newsItem.service.ts deleteNewsItem`) writes a tombstone **before** deleting (find → recordTombstones → findByIdAndDelete).
- Ledger TTL expiry is a feature: after 30 days a resurfacing story is genuinely re-newsworthy and should re-enter the pipeline.

**Capabilities:** ADDED `news-retention` (ledger requirements); MODIFIED `news-ingestion` (hash-dedup consults the ledger).

**Impact:**
- New: `backend/src/app/modules/NewsDedupLedger/` (`newsDedupLedger.interface.ts`, `newsDedupLedger.model.ts`, `newsDedupLedger.service.ts` with `recordTombstones`).
- `newsIngestion.utils.ts:30-43` — ledger check in `dedupeAgainstStored`.
- `newsItem.service.ts:124-127` — tombstone-before-delete.
- `config/index.ts` + `.env.example` — `NEWS_DEDUP_LEDGER_TTL_DAYS=30`.

### Design decisions

1. **Tombstone-before-delete ordering is the invariant** (here and in R4): a crash between the two steps leaves a harmless extra tombstone (blocks re-ingest of a still-existing item's hash — no-op, since the news_items check also blocks it), never a resurrection window.
2. **TTL seconds are computed at schema-definition time** from config. Changing `NEWS_DEDUP_LEDGER_TTL_DAYS` later does NOT update an existing Mongo TTL index — that requires `collMod`. Document this in `.env.example` next to the var; do not build automatic index reconciliation.
3. **Two `$in` queries, not `$unionWith`:** keeps `dedupeAgainstStored` readable and both queries indexed; they can run in `Promise.all`.
4. **`title`/`source` are debugging fields only** — never queried; keep the ledger lean.

### Spec delta

Capability `news-retention` (ADDED):

```markdown
## ADDED Requirements

### Requirement: Dedup Tombstone Ledger
The system SHALL maintain a `news_dedup_ledger` collection recording the
`content_hash` (unique), title, source, and deletion time of every news item
deleted by any delete path, with documents expiring
`NEWS_DEDUP_LEDGER_TTL_DAYS` (default 30) days after deletion. Tombstones SHALL
be written before the corresponding item delete is executed, and tombstone
writes SHALL be idempotent (re-recording an existing hash is not an error).

#### Scenario: Manual delete writes a tombstone
- **WHEN** an admin deletes a news item via DELETE /news-items/:id
- **THEN** a ledger document with that item's content_hash exists before the item is gone

#### Scenario: Ledger self-cleans
- **WHEN** a tombstone passes its TTL
- **THEN** Mongo removes it and the story may re-enter the pipeline as genuinely new
```

Capability `news-ingestion` (MODIFIED):

```markdown
## MODIFIED Requirements

### Requirement: Hash Dedup Consults Deleted-Item Tombstones
During ingestion hash-dedup, a candidate whose `content_hash` matches either a
stored news item or a ledger tombstone SHALL be dropped. If the ledger lookup
fails, ingestion SHALL log the failure and continue with stored-item dedup only.

#### Scenario: Deleted trending repo does not resurrect
- **WHEN** a github_trending item is deleted (tombstoned) and the same repo appears in the next run's fetch
- **THEN** the candidate is dropped at hash-dedup and no new row or LLM/embedding call is made for it

#### Scenario: Ledger unavailable
- **WHEN** the ledger query throws during a run
- **THEN** the run completes using stored-item dedup alone and the failure is logged
```

### Tasks

```markdown
## 1. Model + service
- [ ] 1.1 `NewsDedupLedger` model: content_hash unique, title, source, `deleted_at: { type: Date, default: Date.now }` with TTL index (`expireAfterSeconds` = days × 86400 from config); collection `news_dedup_ledger`
- [ ] 1.2 `recordTombstones(items)`: insertMany `ordered: false`, swallow duplicate-key (E11000) errors only, rethrow anything else
- [ ] 1.3 Config: `NEWS_DEDUP_LEDGER_TTL_DAYS` default '30' (+ `.env.example` note that changing it later requires a manual index migration via collMod)

## 2. Wire-in
- [ ] 2.1 `dedupeAgainstStored`: `Promise.all` the NewsItem and ledger `$in` queries; union hash sets; ledger query failure → logger.error + empty set
- [ ] 2.2 `deleteNewsItem` (newsItem.service.ts): load the doc, `recordTombstones([...])`, then delete; keep return shape identical

## 3. Tests
- [ ] 3.1 Integration: insert item → delete via service → ledger row exists → run `dedupeAgainstStored` with a same-hash candidate → dropped
- [ ] 3.2 Unit: recordTombstones idempotent on duplicate hash; dedupe fails open when ledger lookup rejects

## 4. Verification
- [ ] 4.1 build passes; TTL index visible (`db.news_dedup_ledger.getIndexes()`)
- [ ] 4.2 Live resurrection test (the master-doc DoD case): delete a github_trending item via the admin endpoint, `POST /api/v1/news-items/ingest`, confirm 0 re-inserts of that repo (check `hash_deduped` count for github_trending in the run history)
```

**Pitfalls:** don't change `computeContentHash`; only swallow E11000 in recordTombstones; keep the ledger out of `fetchRecentEmbeddings` (no embeddings stored).

---

## Change R4 — `news-retention-lifecycle`

**Master doc:** Phase 4.2–4.3. **Deep-dive:** §5, §8. **Depends on:** R1 (source_removed + maintenance_runs), R2 (`current_trend_score` floor), R3 (ledger — hard requirement for Stage 2). Do not propose until R1–R3 are archived.
**Effort:** 1.5–2 days. This is the change that actually satisfies the reported requirement.

### Proposal input

**Why:** `news_items` grows monotonically; every feed query, semantic-dedup pool, and report scan pays for it, and stale items still surface anywhere ranking doesn't bury them. With engagement re-polling (R1), a decayed live trend score (R2), and a tombstone ledger (R3) in place, a two-stage lifecycle — reversible archive at 3–4 days or on trend collapse, hard delete with cascade after a cooling-off window — is now safe to ship.

**What changes:**
- **Lifecycle fields on `news_items`:** `lifecycle: { enum: ['active','archived'], default: 'active', index: true }`, `archived_at?: Date`, `archive_reason?: 'max_age' | 'trend_floor' | 'source_removed'`.
- **New scheduled job `runNewsRetention`** (cron `NEWS_RETENTION_CRON=15 */6 * * *`, Redis lock `lock:news_retention`), persisting a `maintenance_runs` doc (`job: 'retention'`) per run. Starts with the idempotent backfill `updateMany({ lifecycle: { $exists: false } }, { $set: { lifecycle: 'active' } })`.
- **Stage 1 — archive (`active → archived`), capped 2000 items/run.** Archive when ANY of:
  - `created_at` older than `NEWS_ARCHIVE_MAX_AGE_HOURS` (default **96** — the "3–4 days" ceiling; `created_at`, not `published_at`, because `published_at` is missing on GH scrape items and untrustworthy on some feeds — the ceiling means "time in our system"), OR
  - `created_at` older than `NEWS_ARCHIVE_MIN_AGE_HOURS` (default 36) AND `current_trend_score < NEWS_ARCHIVE_TREND_FLOOR` (default 2.0) AND the item has an engagement signal (`hasEngagementSignal` from R2 — expressed in the query as source ∈ `REFRESHABLE_SOURCES` OR nonzero stored engagement) — this is "immediately when out of trend", with a grace period and without slaughtering engagement-less RSS/Medium items at the 36 h line (and future editorial sources from the new-sources plan — §0.3.A), OR
  - `source_removed: true` (any age).
  - **Protections (excluded from archive in the same query):** items referenced by a category override with `overridden_at` within 30 days (`NewsItemCategoryOverride.distinct('news_item_id', { overridden_at: { $gte: cutoff } })` — a human curated it); items with `needs_review: true` younger than 7 days. (Story-chain protection — "skip items whose `story_id` has any active member at/above the trend floor" — is deferred to Problem 4, which introduces `story_id`; §0.3.B records the exact clause and the whole-story archival/tombstone obligations so R4's spec doesn't need reopening. R4's guard-clause structure, design decision 8, exists to make that a one-line addition.)
- **Stage 2 — hard delete (`archived → gone`), batches of 500/run:** items with `archived_at < now − NEWS_DELETE_AFTER_DAYS` (default 14). Cascade order per batch: (1) `recordTombstones` (R3) → (2) `NewsItemCategoryOverride.deleteMany({ news_item_id: { $in: ids } })` → (3) `NewsItem.deleteMany({ _id: { $in: ids } })`.
- **Archived items disappear from all product surfaces:**
  - Feed: `getAllNewsItems` applies base filter `lifecycle: { $ne: 'archived' }` when the request doesn't specify `lifecycle` ($ne-form so legacy/missing-field rows stay visible pre-backfill). `?lifecycle=archived` (admin escape hatch) flows through `QueryBuilder.filter()` automatically once whitelisted in the validation schema.
  - `report.opportunities.ts`, `chat.retrieval.ts`, `generatedContent.job.ts` candidate queries gain the same `$ne` filter.
  - `fetchRecentEmbeddings` gains it too (defense-in-depth; the 72 h window mostly excludes archived items already).
  - `getSingleNewsItem` still returns archived items (old generated content links must keep resolving until hard delete).
- **Restore path:** extend `updateNewsItemValidation` with `lifecycle: z.enum(['active','archived']).optional()`; restoring is `PATCH /news-items/:id { "lifecycle": "active" }` on the existing admin route (service must also clear `archived_at`/`archive_reason` when flipping to active).
- **Refresh-job scope tightens:** R1's candidate query gains `lifecycle: { $ne: 'archived' }` (resolve R1's TODO).
- **Admin observability:** `GET /news-items/maintenance-runs?limit=20&job=retention` (requireAuth+requireAdmin, registered **above** the `/:id` routes like `/ingestion-runs`); small runs table on `frontend/src/pages/dashboard/Admin.tsx` next to the existing ingestion-runs table (glass-card styling, per design tokens).

**Capabilities:** MODIFIED `news-retention` (adds lifecycle + jobs to the capability R3 created); MODIFIED `engagement-refresh` (scope excludes archived).

**Impact:** `newsItem.model.ts`/`interface`/`validation.ts`/`service.ts`; new `backend/src/app/modules/NewsRetention/newsRetention.service.ts`; `scheduler.ts` (+ bootstrap call site); `MaintenanceRun` reused; `report.opportunities.ts`; `chat.retrieval.ts`; `generatedContent.job.ts`; `newsIngestion.utils.ts` (fetchRecentEmbeddings); `NewsRefresh/newsRefresh.service.ts`; `newsItem.route.ts` + new controller fn (or extend a MaintenanceRun controller); frontend Admin page + api client + types.

### Design decisions

1. **Archive-then-delete, never direct delete:** the aggressive part (3–4 days / trend floor) is fully reversible during tuning — a mis-calibrated floor is one `updateMany` away from undone, not data loss; generated content referencing an item keeps resolving for 14 more days; cooling-off before destruction.
2. **Config sanity in `superRefine`** (extend the existing block): `NEWS_ARCHIVE_MIN_AGE_HOURS < NEWS_ARCHIVE_MAX_AGE_HOURS`, `NEWS_DELETE_AFTER_DAYS ≥ 1`, `NEWS_ARCHIVE_TREND_FLOOR` in [0, 10].
3. **The engagement-signal guard in Mongo terms:** `$or: [ { source: { $in: REFRESHABLE_SOURCES } }, { 'engagement.points': { $gt: 0 } }, { 'engagement.comments': { $gt: 0 } }, { 'engagement.stars_delta': { $gt: 0 } } ]` — the `$in` list imported from R1's registry keys (never a literal source list), mirroring `hasEngagementSignal` exactly; unit-test the query predicate against the function so they can't drift, including for a hypothetical future source (a fake registry entry in the test).
4. **Ingestion-race non-goal (deep-dive §8.1):** retention deleting between ingestion's dedup read and insert can produce one duplicate row; window is milliseconds, the next retention pass removes it. Do not add cross-job locking; tombstone-first ordering already covers the dangerous direction.
5. **Stage 1 cap (2000) exists for the first production run** — months of backlog archive over a few runs instead of one giant write burst while the team is watching the feed. Stage 2's 500/batch bounds cascade transactions.
6. **`getSingleNewsItem` intentionally unfiltered** — archived ≠ hidden-by-id; document with a comment.
7. **Feed cache staleness accepted:** report/content Redis caches (6 h/24 h TTL) may briefly reference archived items; content generation soft-fails and reports rebuild on expiry. Document, don't engineer around.
8. **Composable guard clauses:** build the Stage-1 archive filter as an array of named protection predicates (`protectionClauses: FilterQuery<INewsItem>[]`) combined with `$nor`, not one hand-woven query object. Two protections exist today (recent override, fresh needs_review); Problem 4 adds the story-liveness clause (§0.3.B) as a third array entry without restructuring the query, and each clause gets its own integration test.

### Spec delta (capability `news-retention`, MODIFIED — restate alongside R3's requirements)

```markdown
## ADDED Requirements

### Requirement: News Item Lifecycle States
Every news item SHALL carry a `lifecycle` state (`active` | `archived`,
default `active`, indexed) with `archived_at` and `archive_reason`
(`max_age` | `trend_floor` | `source_removed`) set on archival. Items missing
the field (pre-migration rows) SHALL be treated as active and backfilled
idempotently by the retention job.

#### Scenario: Restore via admin update
- **WHEN** an admin PATCHes an archived item with `lifecycle: "active"`
- **THEN** the item returns to the feed and its archived_at/archive_reason are cleared

### Requirement: Scheduled Archival of Old and Out-of-Trend Items
A Redis-locked retention job (cron `NEWS_RETENTION_CRON`, default every 6 hours)
SHALL archive active items (≤ 2000 per run) when any of the following holds:
age since `created_at` exceeds `NEWS_ARCHIVE_MAX_AGE_HOURS` (default 96); OR age
exceeds `NEWS_ARCHIVE_MIN_AGE_HOURS` (default 36) AND `current_trend_score` is
below `NEWS_ARCHIVE_TREND_FLOOR` (default 2.0) AND the item has an engagement
signal (refreshable source or nonzero engagement); OR `source_removed` is true.
Items SHALL NOT be archived while referenced by a category override newer than
30 days, or while `needs_review` and younger than 7 days.

#### Scenario: 3–4 day ceiling
- **WHEN** an active item's created_at is older than 96 hours
- **THEN** the next retention run archives it with reason max_age

#### Scenario: Out-of-trend archive
- **WHEN** a 48-hour-old hackernews item's current_trend_score is 1.1
- **THEN** it is archived with reason trend_floor

#### Scenario: Engagement-less sources are exempt from the floor
- **WHEN** a 48-hour-old `rss:medium.com` item has score 0 (no engagement signal)
- **THEN** it is NOT archived until the max-age ceiling

#### Scenario: Slow starter gets its grace period
- **WHEN** an item is 20 hours old with a score below the floor
- **THEN** it is not archived (minimum age not reached)

#### Scenario: Curated item protected
- **WHEN** an otherwise-archivable item has a category override from 5 days ago
- **THEN** it is not archived

### Requirement: Archived Items Leave Product Surfaces
Archived items SHALL be excluded from the default feed listing, report
opportunity candidates, chat news context, auto-generation candidates, and the
ingestion embedding pool. Fetch-by-id SHALL still resolve archived items, and
an explicit `?lifecycle=archived` feed query (admin escape hatch) SHALL return
them.

#### Scenario: Archived item absent from default feed
- **WHEN** GET /news-items is called with no lifecycle parameter
- **THEN** archived items do not appear, while legacy rows without the field do

#### Scenario: Escape hatch
- **WHEN** GET /news-items?lifecycle=archived is called
- **THEN** only archived items are returned

### Requirement: Cascaded Hard Delete After Cooling-Off
The retention job SHALL hard-delete items archived more than
`NEWS_DELETE_AFTER_DAYS` (default 14) days ago, in batches of at most 500,
executing per batch in order: tombstone insertion into the dedup ledger, then
category-override cleanup, then item deletion. Each retention run SHALL persist
a `maintenance_runs` document (`job: 'retention'`) with per-stage counts
(backfilled, archived by reason, deleted, overrides_removed, tombstones_written).

#### Scenario: Cascade removes overrides
- **WHEN** a hard-deleted item had category overrides
- **THEN** those override rows are deleted in the same batch

#### Scenario: Crash between tombstone and delete is safe
- **WHEN** the job fails after writing a batch's tombstones but before deleting the items
- **THEN** the items still exist, the extra tombstones are harmless, and the next run completes the deletion

#### Scenario: Retention run recorded
- **WHEN** a retention run completes
- **THEN** a maintenance_runs document with job "retention" and per-stage counts exists
```

Capability `engagement-refresh` (MODIFIED): the refresh job's candidate scope SHALL exclude archived items (one requirement + scenario).

### Tasks

```markdown
## 1. Schema & config
- [ ] 1.1 Model/interface: `lifecycle` (enum, default 'active', index), `archived_at?`, `archive_reason?` (enum)
- [ ] 1.2 Config: NEWS_RETENTION_CRON='15 */6 * * *', NEWS_ARCHIVE_MAX_AGE_HOURS='96', NEWS_ARCHIVE_MIN_AGE_HOURS='36', NEWS_ARCHIVE_TREND_FLOOR='2.0', NEWS_DELETE_AFTER_DAYS='14' (+ superRefine: MIN<MAX, DELETE≥1, FLOOR∈[0,10]); export under `news_ingestion.retention`; document all in `.env.example` with the "3–4 days" rationale
- [ ] 1.3 `updateNewsItemValidation` + `getAllNewsItemsValidation`: add `lifecycle` (enum / string); `updateNewsItem` service clears archived_at/archive_reason when setting lifecycle 'active'

## 2. Retention job
- [ ] 2.1 `NewsRetention/newsRetention.service.ts` `runNewsRetention()`: Redis lock (`lock:news_retention`, PX < cron period); backfill updateMany; Stage 1 archive query per spec built from the named `protectionClauses` array under `$nor` (design decision 8: recent-override clause via `NewsItemCategoryOverride.distinct`, fresh-needs_review clause) with the engagement-signal `$or` using `REFRESHABLE_SOURCES` from R1 (design decision 3); `$set lifecycle/archived_at/archive_reason`, cap 2000, count per reason
- [ ] 2.2 Stage 2: find archived_at < cutoff, project `_id content_hash title source`, batches of 500: recordTombstones → override deleteMany → NewsItem deleteMany; accumulate counts
- [ ] 2.3 Persist MaintenanceRun (`job: 'retention'`) in try/catch; scheduler `startNewsRetentionScheduler` + bootstrap call
- [ ] 2.4 Unit test: hasEngagementSignal (fn) ≡ the Mongo `$or` (property test over representative docs)
- [ ] 2.5 Integration tests (memory server, manipulate created_at/archived_at directly): max-age archive; trend-floor archive with signal; rss exempt from floor; min-age grace; override + needs_review protections; source_removed immediate; restore clears fields; Stage 2 cascade (tombstone exists, override gone, item gone); crash-between-steps idempotency (run Stage 2 twice)

## 3. Surface exclusions
- [ ] 3.1 `getAllNewsItems`: when query lacks `lifecycle`, add `lifecycle: { $ne: 'archived' }` base filter (apply to the initial `NewsItem.find(...)` passed into QueryBuilder so countTotal stays consistent); explicit `?lifecycle=` passes through untouched
- [ ] 3.2 Same `$ne` filter: `report.opportunities.ts:41`, `chat.retrieval.ts:58`, `generatedContent.job.ts:40`, `fetchRecentEmbeddings` (`newsIngestion.utils.ts:47`)
- [ ] 3.3 R1 refresh candidate query: add the filter (remove the TODO)
- [ ] 3.4 Integration test: archived item absent from feed/report/chat/auto-gen candidates; present via ?lifecycle=archived and by id

## 4. Admin observability
- [ ] 4.1 `GET /news-items/maintenance-runs` (limit≤100, optional `job` filter), requireAuth+requireAdmin, registered above `/:id` routes; controller in MaintenanceRun module
- [ ] 4.2 Frontend: api client fn + types; Admin.tsx retention-runs table (started, duration, archived-by-reason chips, deleted count) beside the ingestion-runs table; responsive ≥375px, dark mode
- [ ] 4.3 Frontend: feed fetch-by-id already tolerant of 404? verify and, if needed, toast + graceful fallback (deleted items linked from old generated content)

## 5. Verification (maps to master-doc DoD + deep-dive acceptance checklist)
- [ ] 5.1 build + lint pass (both apps); server boots with zero new vars
- [ ] 5.2 Backdate a batch of items >96 h → run job → archived with reason max_age; feed page 1 clean; `?lifecycle=archived` shows them
- [ ] 5.3 Backdate an item 48 h with low score + HN source → trend_floor archive; same-age rss item survives
- [ ] 5.4 Restore via PATCH → reappears in feed
- [ ] 5.5 Backdate archived_at >14 d → run job → tombstone written, override cascade-deleted, item gone; immediately re-run ingestion with the same URL live → 0 re-inserts (master DoD resurrection test)
- [ ] 5.6 `db.maintenance_runs` shows retention runs; Admin page renders both tables
- [ ] 5.7 Over a multi-day observation window: `db.news_items.countDocuments()` plateaus (master DoD "DB size stabilizes")
```

**Pitfalls:** register the new GET route above `/:id` (`newsItem.route.ts:14` shows the precedent and the reason); use `$ne: 'archived'` not `lifecycle: 'active'` in read paths (legacy rows lack the field until backfill); never archive/delete outside the job (no request-path side effects); Stage 2 must project `content_hash/title/source` before deleting or tombstones can't be written; do not touch the `IngestionRun` model.

---

## Definition of done (whole plan — maps to master doc §5 and deep-dive acceptance checklist)

- [ ] Refresh job visibly updates `engagement_history` + `current_trend_score` for HN/Reddit/dev.to items within one hour of ingest (R1+R2)
- [ ] Feed default sort uses the decayed score; a 4-day-old item no longer appears on page 1 even before deletion runs (R2)
- [ ] Item archived by trend-floor is restorable via the existing admin PATCH and reappears in the feed (R4)
- [ ] Hard-delete resurrection test passes: full Stage 2 on a `github_trending` item, re-run ingestion while the repo still trends → tombstone blocks re-insert, 0 duplicates (R3+R4)
- [ ] Override cascade verified: hard-deleting an overridden item removes the override row (R4)
- [ ] Chat/report/auto-gen surface no archived items (R4 — note: via query filters, **not** a vector-index migration; see §0.2.1)
- [ ] `news_items` count plateaus over a 2-week observation window; `maintenance_runs` and `news_dedup_ledger` self-clean via TTL
- [ ] Server boots with **none** of the 11 new env vars set; all are documented in `backend/.env.example`
- [ ] All timestamps epoch-based UTC; both scheduled jobs are Redis-locked
- [ ] Sibling-plan compatibility holds: refreshable sources and the engagement-signal rule derive from the R1 fetcher registry (no literal source lists anywhere in retention code), so shipping any of the new-sources plan's 7 adapters requires zero retention changes; the Problem-4 obligations (§0.3.B story-liveness clause, whole-story archival, corroboration score recompute via the exported pure function) are restated in R4's archived proposal

## New env vars introduced by this plan (all optional, safe defaults)

```
NEWS_REFRESH_CRON=30 * * * *          # R1 — engagement re-poll, offset from ingestion's 0 */3
NEWS_REFRESH_WINDOW_HOURS=96          # R1 — re-poll items younger than this
NEWS_REFRESH_MAX_REQUESTS=200         # R1 — HTTP budget per refresh run
NEWS_TREND_DECAY_TAU_HOURS=36         # R2 — decay time constant
NEWS_TREND_VELOCITY_BONUS=2           # R2 — rising-story bonus weight
NEWS_DEDUP_LEDGER_TTL_DAYS=30         # R3 — tombstone lifetime (index migration needed if changed later)
NEWS_RETENTION_CRON=15 */6 * * *      # R4 — retention job schedule
NEWS_ARCHIVE_MAX_AGE_HOURS=96         # R4 — "3–4 days" hard ceiling
NEWS_ARCHIVE_MIN_AGE_HOURS=36         # R4 — grace period before the trend floor applies
NEWS_ARCHIVE_TREND_FLOOR=2.0          # R4 — "out of trend" threshold on the decayed score
NEWS_DELETE_AFTER_DAYS=14             # R4 — archived → hard delete cooling-off
```

Tuning is empirical (deep-dive §8.5): ship these defaults, watch `maintenance_runs` for 1–2 weeks (archive counts by reason), then tighten. The floor value 2.0 is a starting point, not a law.
