# RAVI — News Sources Fix: OpenSpec Execution Plan

**Problem (as reported):** No news from Reddit / RSS; very rare from GitHub Trending and dev.to; Medium missing.
**Parent analysis:** [MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md](./MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md) — Problem 1 (§2 root-cause matrix, §4 Phases 0–1).
**Date:** 2026-07-16

> Note: the master doc links to `NEWS-PIPELINE-SOURCES.md` for details — **that file does not exist in the repo**. This plan replaces it: every fact below was re-verified directly against the code on 2026-07-16, and all file paths/line references here are the authoritative ones.

This plan decomposes the fix into **4 OpenSpec changes**, ordered so each is independently shippable and verifiable. For each change, run:

```
/opsx:propose   → feed it the "Proposal input" + "Spec delta" + "Tasks" sections below
/opsx:apply     → implement the generated tasks
verify          → run the "Verification" steps below
/opsx:archive   → archive when the change's DoD passes
```

---

## 0. Verified baseline (read before proposing anything)

All ingestion code: `backend/src/app/modules/NewsIngestion/`.

| Fact | Location |
|---|---|
| Config schema lives at `backend/src/app/config/index.ts` — **not** `backend/src/config/index.ts` (an older archived proposal used the wrong path; do not copy it) | `backend/src/app/config/index.ts` |
| `NEWS_INGESTION_RSS_FEEDS` is optional, parsed as comma-separated list; set **nowhere** (`backend/.env`, `.env.example` — neither has any `NEWS_INGESTION_*` or `REDDIT_SUBREDDITS` var) | `config/index.ts:70`, `:181-184` |
| Reddit adapter hits unauthenticated `https://www.reddit.com/r/<sub>/top.json` → **HTTP 403** (verified live 2026-07-16); error caught per-subreddit, run continues with 0 items | `adapters/reddit.ts:22-25`, `:44-47` |
| dev.to adapter fetches `?top=7` (top of last **7 days**) but `filterFresh` drops anything older than 72 h | `adapters/devto.ts:14`, `newsIngestion.utils.ts:21-24` |
| GitHub Trending scrapes HTML with regexes; parse failure yields **0 items silently** (no throw); items have `published_at: undefined` | `adapters/githubTrending.ts:21-24`, `:43` |
| `filterFresh` treats missing `published_at` as fresh (GH items always pass); `fetchRecentEmbeddings` filters `published_at: { $gte: cutoff }` so GH items are **excluded from the semantic-dedup pool** | `newsIngestion.utils.ts:21-24`, `:46-49` |
| Adapter registry: 5 adapters, errors swallowed into `{ source, items: [], error }` — error is logged but never persisted | `adapters/index.ts:9-15`, `:17-30` |
| Per-run `IngestionSummary` (per-source fetched/deduped/discarded/stored) is computed and returned but **never persisted** — no `IngestionRun` model exists anywhere | `newsIngestion.service.ts:127-136` |
| Manual trigger: `POST /api/v1/news-items/ingest` (requireAuth + requireAdmin) | `backend/src/app/modules/NewsItem/newsItem.route.ts:12` |
| Cron trigger: `startNewsIngestionScheduler`, default `0 */3 * * *` | `backend/src/app/lib/scheduler.ts:13-24` |
| `NewsItem.source` is a free `String` (no enum) — per-feed source labels are schema-safe | `backend/src/app/modules/NewsItem/newsItem.model.ts:5` |
| Frontend does not consume `NewsItem.source` anywhere yet (verified by grep) — renaming/labeling sources breaks nothing client-side | — |
| Redis client available as `redis` export | `backend/src/app/lib/redis.ts:5` |
| `openspec/specs/` is **empty** (no change has ever been synced) — spec deltas therefore have no main spec to diff against | `openspec/specs/` |

**Global conventions for all 4 changes (avoid the known mistakes):**

1. **Capability naming:** the ingestion capability is `news-ingestion` (used by the two archived changes `2026-07-14-news-ingestion-pipeline` and `2026-07-14-filter-pipeline`). Reuse it for pipeline-behavior deltas. New standalone capabilities introduced below: `ingestion-observability` (Change 2 only).
2. **Spec-delta form:** since `openspec/specs/` is empty, write `MODIFIED Requirements` with the **full restated requirement text** (the archived `filter-pipeline` change did exactly this) — never a bare diff fragment.
3. **Env-var rule (hard requirement, master doc DoD):** every new env var is optional-with-safe-default in the zod schema; **the server must boot with none of them set**. Document each one in `backend/.env.example`. New vars go in `config/index.ts` in both the `envSchema` and the exported `news_ingestion` object.
4. **Adapter failure discipline:** adapters throw on hard failure (caught by `runAllAdapters`); per-sub-resource failures (one feed, one subreddit) are caught inside the adapter and logged, returning partial results. Never let one bad feed kill the batch. Keep this pattern.
5. **All timestamps UTC / epoch arithmetic** (`Date.now()`-based) — never format/parse local dates.
6. **Out of scope for this plan** (belongs to other problems in the master doc — do not sneak them in): retention/TTL, tombstone ledger, engagement re-polling, two-band dedup/story chains, changing `content_hash` semantics, changing the 0.88 semantic threshold.

---

## Change 1 — `news-source-quick-wins`

**Master doc:** Phase 0 (steps 0.1, 0.2, 0.4) + Phase 1 step 1.6.
**Fixes:** RSS = 0 forever; Medium missing; dev.to very rare. **Effort:** ~half a day. **No schema changes, no new collections.**

### Why per-feed labeling belongs in this change (sequencing insight)

Per-feed RSS source labels (`rss:techcrunch.com` instead of flat `rss`) change the `content_hash` input (`sha256(source:url)`, `newsIngestion.utils.ts:14-15`). Today RSS has stored **zero items ever**, so relabeling now costs nothing. If labels ship *after* feeds have been ingesting under `source: 'rss'`, every stored RSS item would re-ingest as a duplicate under the new label. **Label first, then populate feeds — this ordering is the whole reason 1.6 is folded into this change.**

### Proposal input (for `/opsx:propose`)

**Why:** Three of five news sources deliver zero or near-zero items. RSS iterates an empty feed list because `NEWS_INGESTION_RSS_FEEDS` was never set or documented; Medium has no adapter and can only arrive via those (empty) RSS feeds; dev.to fetches the top of the last 7 days while the freshness filter discards anything older than 72 h, so almost everything it fetches is dropped, and the few survivors are hash-deduped on subsequent runs because the weekly top list barely changes.

**What changes:**
- Label RSS items per feed: `source: 'rss:<hostname>'` (e.g. `rss:techcrunch.com`, `rss:medium.com`) so per-source counts and future health checks are meaningful.
- Make the ingestion summary robust to adapters that emit multiple source labels (RSS now does): per-source counts must be keyed by the union of adapter names and item source labels, not just the 5 adapter names.
- Change dev.to fetch window to match the 72 h freshness window: `?top=1&per_page=50` plus a second `?state=rising&per_page=50` call, merged and deduped by article id.
- Populate `NEWS_INGESTION_RSS_FEEDS` in `backend/.env` and ship a commented curated starter list in `backend/.env.example` — including Medium tag feeds, which resolves "Medium missing" with no new adapter.
- Document **every** existing `NEWS_INGESTION_*` env var + `REDDIT_SUBREDDITS` in `backend/.env.example` (all are undocumented today — the root cause of the empty feed list).

**Capabilities:** MODIFIED `news-ingestion` (source normalization + fetch-window requirements).

**Impact:**
- `backend/src/app/modules/NewsIngestion/adapters/rss.ts` — per-feed label.
- `backend/src/app/modules/NewsIngestion/adapters/devto.ts` — two-call fetch.
- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts:36-37,127-134` — summary keyed on union of source labels.
- `backend/.env.example`, `backend/.env` — env documentation + values.
- No config-schema code change needed (`NEWS_INGESTION_RSS_FEEDS` parsing already exists).

### Design decisions

1. **Hostname derivation:** `new URL(feedUrl).hostname.replace(/^www\./, '')`, prefixed `rss:`. On URL-parse failure fall back to flat `'rss'` (never throw during labeling).
2. **dev.to merge:** fetch both endpoints in parallel (`Promise.all`), concat, dedupe by `article.id` (Map keyed on id). If one call fails, log and continue with the other (per-sub-resource discipline, mirrors `rss.ts:26-35`). Only throw if **both** fail.
3. **Summary union fix** (`newsIngestion.service.ts`): replace `const sources = adapterResults.map(r => r.source)` with a union: adapter names ∪ keys of `fetchedCounts` (item-level labels). An adapter that errored still appears (its name with all-zero counts and its error), and each `rss:<host>` appears individually.
4. **Curated starter feed list** (verified-stable, ToS-friendly official feeds; operators trim/extend per brand):

   ```
   NEWS_INGESTION_RSS_FEEDS=https://techcrunch.com/feed/,https://www.theverge.com/rss/index.xml,https://feeds.arstechnica.com/arstechnica/index,https://www.wired.com/feed/rss,https://hnrss.org/frontpage,https://medium.com/feed/tag/artificial-intelligence,https://medium.com/feed/tag/programming,https://medium.com/feed/tag/technology
   ```

   Medium tag feeds (`medium.com/feed/tag/<tag>`) are official RSS endpoints — this is the entire "Medium missing" fix. Caveat: Medium feeds only expose ~10 latest items per tag and are sometimes slow; that's fine, the 3-hourly cron catches the delta.
5. **HN Algolia switch (master 0.3) is explicitly deferred** — HN works today (31 requests per run is tolerable); don't grow this change.

### Spec delta (capability `news-ingestion`)

```markdown
## MODIFIED Requirements

### Requirement: Source Normalization With Per-Feed RSS Labels
Every adapter SHALL emit normalized items tagged with a stable `source` label. The
RSS adapter SHALL label each item with `rss:<hostname>` derived from its feed URL
(hostname lowercased, leading `www.` stripped), falling back to `rss` only when the
feed URL cannot be parsed, so that per-source counts distinguish individual feeds.

#### Scenario: Two feeds produce separately-labeled items
- **WHEN** the RSS adapter fetches `https://techcrunch.com/feed/` and `https://medium.com/feed/tag/programming`
- **THEN** their items carry `source: "rss:techcrunch.com"` and `source: "rss:medium.com"` respectively, and the run summary reports each label as its own source

#### Scenario: Ingestion summary covers erroring adapters and multi-label adapters
- **WHEN** a pipeline run completes where one adapter threw and the RSS adapter produced items under multiple `rss:<host>` labels
- **THEN** the per-source summary contains one entry per `rss:<host>` label plus an entry for the erroring adapter with zero counts

### Requirement: dev.to Fetch Window Matches Freshness Window
The dev.to adapter SHALL fetch articles whose age distribution fits inside the
`NEWS_INGESTION_MAX_AGE_HOURS` freshness window by querying the daily top list
(`top=1`) and the rising list (`state=rising`), merged and deduplicated by article id.

#### Scenario: Daily-window articles survive the freshness filter
- **WHEN** the dev.to adapter runs with `NEWS_INGESTION_MAX_AGE_HOURS=72`
- **THEN** it requests `top=1&per_page=50` and `state=rising&per_page=50`, and an article returned by both appears exactly once in the adapter output

#### Scenario: One dev.to endpoint fails
- **WHEN** the `top` request fails but the `rising` request succeeds
- **THEN** the adapter logs the failure and returns the rising articles instead of throwing

### Requirement: Documented Ingestion Environment Variables
Every `NEWS_INGESTION_*` variable and `REDDIT_SUBREDDITS` SHALL be documented in
`backend/.env.example` with its default and effect, including a curated starter
value for `NEWS_INGESTION_RSS_FEEDS`. The server SHALL boot with none of them set.

#### Scenario: Fresh clone boots without ingestion vars
- **WHEN** the backend starts with a `.env` that has no `NEWS_INGESTION_*` vars
- **THEN** config validation passes and the RSS adapter iterates an empty feed list without error
```

### Tasks

```markdown
## 1. RSS per-feed labeling
- [ ] 1.1 In `adapters/rss.ts`, add `const feedLabel = (feedUrl: string): string` returning `rss:<hostname>` (lowercase, strip `www.`), `rss` on parse failure; pass it into `fetchFeed` and use it as each item's `source`
- [ ] 1.2 Unit test: feed URL → label (`https://www.techcrunch.com/feed/` → `rss:techcrunch.com`; malformed URL → `rss`)

## 2. Summary union fix
- [ ] 2.1 In `newsIngestion.service.ts`, build the summary source list as the union of adapter names (`adapterResults.map(r => r.source)`) and `Object.keys(fetchedCounts)`; keep zero-count entries for erroring adapters
- [ ] 2.2 Ensure `SourceSummary` math (`:127-134`) still balances per label (fetched = fresh_dropped + deduped + discarded + stored buckets)

## 3. dev.to window fix
- [ ] 3.1 In `adapters/devto.ts`, fetch `https://dev.to/api/articles?top=1&per_page=50` and `https://dev.to/api/articles?state=rising&per_page=50` in parallel; merge, dedupe by `article.id`; per-call catch + log, throw only if both fail
- [ ] 3.2 Unit test: overlapping article in both responses appears once; one-call-failure returns the other's items

## 4. Env documentation + values
- [ ] 4.1 Append a `# ---- News ingestion ----` section to `backend/.env.example` documenting: NEWS_INGESTION_RSS_FEEDS (with curated starter list), NEWS_INGESTION_MAX_AGE_HOURS=72, NEWS_INGESTION_MIN_RELEVANCE=4.0, NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD=0.88 (calibrated — do not change casually), NEWS_INGESTION_CRON=0 */3 * * *, REDDIT_SUBREDDITS, NEWS_INGESTION_CATEGORY_CONFIDENCE_THRESHOLD=0.6, the three NEWS_INGESTION_OPPORTUNITY_WEIGHT_* vars (must sum to 1), NEWS_INGESTION_OPPORTUNITY_FALLBACK_RELEVANCE=5.0
- [ ] 4.2 Set `NEWS_INGESTION_RSS_FEEDS` in local `backend/.env` to the starter list (gitignored — this is an operator step; also set it in the production host's env)

## 5. Verification
- [ ] 5.1 `cd backend && npm run build` passes; server boots with NEWS_INGESTION_* vars removed
- [ ] 5.2 `POST /api/v1/news-items/ingest` (admin JWT): response summary shows non-zero `fetched` for several `rss:<host>` labels and for `devto`
- [ ] 5.3 Confirm at least one stored item has `source` starting `rss:medium.com` (Medium fixed)
- [ ] 5.4 Second manual run immediately after: dev.to `fetched` stays high while `stored` drops to ~0 (hash dedup working, not starving)
```

**Pitfalls:** don't touch `computeContentHash`; don't add an RSS enum to the NewsItem model; remember `.env` is gitignored (task 4.2 is doc + operator action, the committed artifact is `.env.example`).

---

## Change 2 — `ingestion-run-observability`

**Master doc:** Phase 1 steps 1.1–1.3. **Prerequisite for validating Changes 3–4 and for everything in the other three problem docs.**
**Fixes:** "sources die and nobody notices" (Reddit 403'd invisibly for weeks). **Effort:** 1–1.5 days.

### Proposal input

**Why:** Every filter layer drops silently and adapter errors are only pino log lines. A source can return zero items for weeks (Reddit demonstrably has) with no persisted evidence. Per-run, per-source, per-layer counts must be persisted and surfaced so source death is visible and later fixes are verifiable.

**What changes:**
- New `IngestionRun` collection persisting one document per pipeline run (cron or manual): timings, trigger, per-source per-layer counts (`fetched, fresh_dropped, hash_deduped, semantic_deduped, relevance_dropped, stored`), and per-source error strings.
- Persistence happens **inside** `runIngestionPipeline()` so both cron and the manual endpoint are covered; a run-persistence failure must not fail the ingestion itself.
- Admin endpoint `GET /api/v1/news-items/ingestion-runs?limit=20` returning recent runs plus a computed per-source `zero_streak` (consecutive most-recent runs with `fetched === 0`) and `alert: zero_streak >= 3`.
- Admin dashboard page (`frontend/src/pages/dashboard/Admin.tsx`) shows the last runs table and a red badge for alerting sources.
- TTL index (30 days) on `IngestionRun.started_at` so the collection self-cleans.

**Capabilities:** ADDED `ingestion-observability`; MODIFIED `news-ingestion` (pipeline must record layer counts).

**Impact:**
- New module `backend/src/app/modules/IngestionRun/` (`ingestionRun.model.ts`, `ingestionRun.interface.ts`, `ingestionRun.service.ts`, `ingestionRun.controller.ts`).
- `newsIngestion.service.ts` — count each layer per source (semantic-dedup per-source counts are **not** currently computed — add `countBySource(deduped)`), assemble + save the run doc, accept a `trigger: 'cron' | 'manual'` arg.
- `newsIngestion.controller.ts:8`, `scheduler.ts:17` — pass the trigger.
- `backend/src/app/modules/NewsItem/newsItem.route.ts` — new GET route. **Route-order pitfall:** register `/ingestion-runs` before any `/:id` route in that file or it will be shadowed.
- Frontend: `frontend/src/lib/api/` client fn + Admin page table (glass-card styling, amber badge for alerts per design tokens).

### Design decisions

1. **Schema:**
   ```ts
   {
     started_at: Date (required, index + TTL 30d),
     finished_at: Date,
     duration_ms: Number,
     trigger: { type: String, enum: ['cron', 'manual'] },
     total_stored: Number,
     sources: [{
       source: String,            // adapter name or rss:<host> label
       fetched: Number,
       fresh_dropped: Number,
       hash_deduped: Number,
       semantic_deduped: Number,
       relevance_dropped: Number,
       stored: Number,
       error: String,             // optional
     }],
   }
   ```
2. **Layer counts derivation** (all via the existing `countBySource` helper, per label):
   `fresh_dropped = fetched − fresh`; `hash_deduped = fresh − unique`; `semantic_deduped = unique − deduped` (**new count needed**); `relevance_dropped = deduped − relevant`; `stored = relevant` (same approximation the summary already documents at `newsIngestion.service.ts:125-126` — keep the comment).
3. **Zero-streak computed at read time**, not stored: the endpoint walks the last N (default 10) runs newest-first per source. No stored alert state, no extra writes, trivially correct after backfills.
4. **Failure isolation:** wrap the `IngestionRun.create()` in try/catch + `logger.error`; the pipeline result is returned regardless.
5. Keep the existing `IngestionSummary` return shape unchanged (the manual endpoint's response contract stays stable); the run document is a superset.

### Spec delta

Capability `ingestion-observability` (ADDED):

```markdown
## ADDED Requirements

### Requirement: Persisted Ingestion Run History
The system SHALL persist one `IngestionRun` document for every pipeline run,
regardless of trigger (cron or manual), recording start/finish timestamps,
duration, trigger type, and per-source counts for every pipeline layer
(fetched, fresh_dropped, hash_deduped, semantic_deduped, relevance_dropped,
stored) plus any per-source error message. Failure to persist the run SHALL NOT
fail or roll back the ingestion itself. Run documents SHALL expire after 30 days.

#### Scenario: Cron run persists a run document
- **WHEN** the scheduled ingestion completes
- **THEN** an `IngestionRun` document exists with `trigger: "cron"` and one sources entry per source label seen in the run, whose layer counts sum consistently (fetched = fresh_dropped + hash_deduped + semantic_deduped + relevance_dropped + stored)

#### Scenario: Adapter error is recorded
- **WHEN** an adapter throws during a run
- **THEN** the run document's entry for that source has `fetched: 0` and the error message

#### Scenario: Run persistence fails
- **WHEN** the `IngestionRun` insert fails
- **THEN** the pipeline still returns its summary and stored items remain stored

### Requirement: Ingestion Run Admin Endpoint With Zero-Streak Alerting
The system SHALL expose `GET /news-items/ingestion-runs` to admin users,
returning the most recent runs (default 20, `?limit=` capped at 100) and, per
source, a `zero_streak` count of consecutive most-recent runs with zero fetched
items, flagged `alert: true` when the streak is 3 or more.

#### Scenario: Dead source is flagged
- **WHEN** a source fetched 0 items in each of the last 3 runs
- **THEN** the endpoint reports that source with `zero_streak >= 3` and `alert: true`

#### Scenario: Non-admin denied
- **WHEN** a non-admin user calls the endpoint
- **THEN** the request is rejected with the standard authorization error
```

Capability `news-ingestion` (MODIFIED): add a requirement that the pipeline computes per-source counts after every layer (this is what makes `semantic_deduped` per source exist).

### Tasks

```markdown
## 1. Model
- [ ] 1.1 Create `backend/src/app/modules/IngestionRun/ingestionRun.interface.ts` + `ingestionRun.model.ts` per the schema above; TTL index: `{ started_at: 1 }, { expireAfterSeconds: 2592000 }`

## 2. Pipeline instrumentation
- [ ] 2.1 In `newsIngestion.service.ts`, add `const dedupedCounts = countBySource(deduped)` and compute the five per-layer per-source counts (union of source labels, see Change 1 task 2.1)
- [ ] 2.2 Add `trigger` parameter to `runIngestionPipeline(trigger: 'cron' | 'manual')`; update `scheduler.ts` (`'cron'`) and `newsIngestion.controller.ts` (`'manual'`)
- [ ] 2.3 Record `started_at` before adapters run and persist the run doc in a try/catch after `insertMany`; carry per-source `error` strings from `AdapterResult.error`
- [ ] 2.4 Unit test: counts balance per source; persistence failure doesn't throw

## 3. Endpoint
- [ ] 3.1 `ingestionRun.service.ts`: `listRuns(limit)` (sort `started_at: -1`) + `computeZeroStreaks(runs)` returning `{ source, zero_streak, alert }[]`
- [ ] 3.2 Controller + route: `GET /ingestion-runs` in `newsItem.route.ts` with `requireAuth, requireAdmin` — registered ABOVE any `/:id` route
- [ ] 3.3 Unit test: streak math (0-fetched runs interleaved with healthy runs reset the streak)

## 4. Admin UI
- [ ] 4.1 API client fn in `frontend/src/lib/api/` for the new endpoint
- [ ] 4.2 In `frontend/src/pages/dashboard/Admin.tsx`: runs table (time, trigger, per-source fetched→stored chips) + amber `alert` badge for zero-streak sources; responsive ≥375px, dark-mode default

## 5. Verification
- [ ] 5.1 Trigger 3 manual ingests with `REDDIT_SUBREDDITS=thisdoesnotexist12345` (controlled dead source, per master DoD) → endpoint shows reddit `zero_streak: 3, alert: true`
- [ ] 5.2 Confirm runs collection has TTL index (`db.ingestionruns.getIndexes()`)
- [ ] 5.3 Admin page renders the table and badge in dark mode
```

---

## Change 3 — `reddit-oauth-adapter`

**Master doc:** Phase 1 step 1.4. **Depends on:** Change 2 (to verify recovery in run history) — soft dependency; code is independent.
**Fixes:** Reddit = 0 items (403). **Effort:** ~1 day + one-time manual app registration.

### One-time manual prerequisite (cannot be automated — do first)

Create a Reddit **script**-type app at https://www.reddit.com/prefs/apps (any redirect URI, e.g. `http://localhost:3001`). Capture the client id (under the app name) and secret. Without these, the adapter must skip cleanly (see below).

### Proposal input

**Why:** Reddit blocks unauthenticated scripted clients — `www.reddit.com/r/<sub>/top.json` returns HTTP 403 (verified live 2026-07-16 with the adapter's exact User-Agent). The error is caught and swallowed, so Reddit has silently contributed zero items. Reddit's supported path for read access is OAuth2 against `oauth.reddit.com`.

**What changes:**
- Reddit adapter authenticates via OAuth2 **client-credentials** grant (application-only auth, correct for a script app reading public listings): `POST https://www.reddit.com/api/v1/access_token` with HTTP Basic `clientId:clientSecret` and body `grant_type=client_credentials`.
- Access token cached in Redis (`reddit:app_token`) with TTL `expires_in − 60`s; on 401 from the API, invalidate and retry once with a fresh token.
- Listings fetched from `https://oauth.reddit.com/r/<sub>/top.json?limit=25&t=day` with `Authorization: bearer <token>` and a compliant User-Agent (`web:growth-studio-news:v1.0 (by /u/<operator-account>)` — Reddit requires this format; configurable via env).
- New optional env vars `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`. When id/secret are unset the adapter logs a warning and returns `[]` **without hitting the network** (boot-without-env rule; also avoids pointless 403 noise).
- `t=day` pins the listing window to 24 h so results fit the 72 h freshness window (the current code omits `t`, which defaults to `day` — now it's explicit and load-bearing).

**Capabilities:** MODIFIED `news-ingestion` (Reddit source requirement).

**Impact:**
- `backend/src/app/modules/NewsIngestion/adapters/reddit.ts` — rewritten around token acquisition + `oauth.reddit.com`.
- `backend/src/app/config/index.ts` — 3 new optional env vars in `envSchema` + `news_ingestion.reddit` config block.
- `backend/.env.example` — document the vars + the app-registration steps.
- Uses existing `redis` from `backend/src/app/lib/redis.ts`.

### Design decisions

1. **Client-credentials, not password grant:** no Reddit account credentials in env; app-only auth is sufficient for public subreddit listings and is what Reddit's API rules prescribe for server scripts.
2. **Token endpoint response:** `{ access_token, token_type: 'bearer', expires_in (seconds), scope }`. Cache in Redis so all instances / consecutive runs share it (also future-proofs the single-process cron caveat in master §5.5).
3. **Rate limits:** app-only OAuth allows ~100 QPS averaged over 10 min — 3 subreddit calls per 3 h run is nowhere near it; no backoff machinery needed beyond the existing per-subreddit catch.
4. **Datacenter-IP caveat (master §5.1):** OAuth removes the 403 for compliant clients, but production-host verification is still mandatory before declaring healthy — that is exactly what the Change 2 run history is for.
5. **Keep the response-shape mapping identical** (`RedditPost` fields are the same under oauth.reddit.com) — only transport/auth changes; `RawNewsItem` output shape untouched.

### Spec delta (capability `news-ingestion`)

```markdown
## MODIFIED Requirements

### Requirement: Reddit Source via OAuth2 Application-Only Auth
The Reddit adapter SHALL authenticate with Reddit via the OAuth2
client-credentials grant using `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, cache
the bearer token in Redis until 60 seconds before expiry, and fetch subreddit
top listings from `oauth.reddit.com` with `t=day` and a compliant User-Agent.
When credentials are not configured the adapter SHALL return no items without
making network calls, and the server SHALL boot normally.

#### Scenario: Credentials configured
- **WHEN** the adapter runs with valid REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET
- **THEN** it obtains (or reuses a cached) bearer token and returns normalized items from each configured subreddit's daily top listing

#### Scenario: Token cached across runs
- **WHEN** a second pipeline run starts before the cached token expires
- **THEN** the adapter reuses the Redis-cached token without calling the token endpoint

#### Scenario: Expired or revoked token
- **WHEN** a listing request returns HTTP 401
- **THEN** the adapter invalidates the cached token, fetches a fresh one, and retries the request once

#### Scenario: Credentials absent
- **WHEN** REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET is unset
- **THEN** the adapter logs a configuration warning and returns zero items with no network request, and the run's source entry shows the skip reason

#### Scenario: One subreddit fails
- **WHEN** one configured subreddit request fails
- **THEN** items from the remaining subreddits are still returned
```

### Tasks

```markdown
## 1. Config
- [ ] 1.1 Add to `backend/src/app/config/index.ts` envSchema: `REDDIT_CLIENT_ID: z.string().optional()`, `REDDIT_CLIENT_SECRET: z.string().optional()`, `REDDIT_USER_AGENT: z.string().default('web:growth-studio-news:v1.0')`
- [ ] 1.2 Export under `news_ingestion.reddit: { client_id, client_secret, user_agent }`
- [ ] 1.3 Document all three in `.env.example` with the prefs/apps registration steps (script app) and the User-Agent format rule

## 2. Adapter
- [ ] 2.1 In `adapters/reddit.ts`, add `getAppToken()`: Redis `GET reddit:app_token`; on miss POST `https://www.reddit.com/api/v1/access_token` (Basic auth, `grant_type=client_credentials`, User-Agent header), `SET ... EX (expires_in - 60)`
- [ ] 2.2 Switch `fetchSubreddit` to `https://oauth.reddit.com/r/<sub>/top.json?limit=25&t=day` with `Authorization: bearer <token>`; on 401, `DEL` the cache key and retry once
- [ ] 2.3 Guard `fetchReddit`: if client_id/secret unset → `logger.warn` + return `[]` (surface "not configured" as the AdapterResult error string so Change 2's run history shows why)
- [ ] 2.4 Unit tests (mock fetch + redis): token cached and reused; 401 → refresh → retry once; unconfigured → no fetch calls

## 3. Verification
- [ ] 3.1 Boot with no REDDIT_* vars → clean boot, run shows reddit skip reason
- [ ] 3.2 With real credentials: `POST /api/v1/news-items/ingest` → reddit `fetched > 0` in the run summary; second run reuses token (verify via debug log / redis TTL)
- [ ] 3.3 Re-verify from the production host before closing (datacenter-IP caveat)
```

---

## Change 4 — `github-trending-hardening`

**Master doc:** Phase 1 step 1.5. **Depends on:** Change 2 (zero-streak alerting is where the soft-failure signal lands).
**Fixes:** GitHub Trending very rare. **Effort:** ~1 day.

### Scope guard

Two of the three GH root causes are fixed here: (a) silent zero-item scrape failure, (b) weak relevance signal for bare `owner/repo` titles + no `published_at`. The third — **dedup starvation** (a repo trending for days is hash-blocked after day one) — is *intentionally not fixed here*: the proper fix is engagement re-polling + story-aware dedup (master Phases 3/5, Problems 3/4). Do not modify `content_hash` semantics in this change; the supplemental Search API source below restores item flow without touching dedup.

### Proposal input

**Why:** The GitHub Trending adapter regex-scrapes HTML and, by design, returns zero items silently when GitHub changes markup — indistinguishable from "nothing trending". Items that do parse carry a bare `owner/repo` title, an optional description, and no `published_at`, so many die at the relevance filter and none participate in the semantic-dedup recent pool.

**What changes:**
- **Zero-parse becomes a visible soft failure:** when the HTTP fetch succeeds but zero repo blocks parse, the adapter throws (`'github_trending: page fetched but 0 repo blocks parsed — markup likely changed'`) so the error lands in the adapter-error path and the run history, where the Change 2 zero-streak alert catches it.
- **Supplemental API-based fetch:** in the same adapter, also query the GitHub Search API for recently-created popular repos: `GET https://api.github.com/search/repositories?q=created:>=<ISO date 3 days ago>&sort=stars&order=desc&per_page=25`. These items have real `created_at` → set `published_at` (they now participate in freshness *and* the semantic-dedup pool), real descriptions, and star counts (`raw_stars_delta = stargazers_count` for new repos). New repos churn run-to-run, so hash dedup no longer starves the source.
- **Richer embedding/categorization text:** title becomes `owner/repo — <description>` when a description exists (scrape and API paths both); bare path kept otherwise. This directly attacks the relevance-filter starvation.
- Optional `GITHUB_TOKEN` env (unauthenticated Search API = 10 req/min, 60 core/hr — one call per 3 h run is fine without it; token raises headroom). Absent token = fully functional.
- Scrape failures and API failures are independent: one path failing must not kill the other's items (merge with per-path catch; throw only if **both** yield nothing and at least one errored).

**Capabilities:** MODIFIED `news-ingestion` (GitHub Trending source requirement).

**Impact:**
- `backend/src/app/modules/NewsIngestion/adapters/githubTrending.ts` — all changes live here.
- `backend/src/app/config/index.ts` + `.env.example` — optional `GITHUB_TOKEN`.
- Dedupe between the two paths by repo full name before returning (same `source_id`).

### Design decisions

1. **Why Search API, not a trending-scrape retry:** retry-hammering a scrape target violates the ToS-discipline caveat (master §5.6). The Search API is official, rate-limited, and returns strictly richer objects.
2. **`created:>=3 days ago`** matches `NEWS_INGESTION_MAX_AGE_HOURS=72` — compute from `Date.now()`, UTC, `YYYY-MM-DD`.
3. **Merged item shape:** `source` stays `'github_trending'` for both paths (one health signal per adapter; per-path counts can wait until someone needs them). `source_id` = repo full name for both, so in-run hash dedup collapses overlaps (same repo trending *and* newly-created).
4. **Title enrichment cap:** truncate description to ~200 chars in the title to keep feed rendering sane; full description still goes to `snippet`.
5. **Accept-header for the API:** `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, plus `Authorization: Bearer <token>` only when set.

### Spec delta (capability `news-ingestion`)

```markdown
## MODIFIED Requirements

### Requirement: GitHub Trending Source With Soft-Failure Visibility and API Supplement
The GitHub Trending adapter SHALL treat a successfully-fetched trending page that
parses to zero repositories as an adapter error (not an empty success), SHALL
supplement scraped results with recently-created popular repositories from the
GitHub Search API (created within the freshness window, sorted by stars,
`published_at` set from `created_at`), SHALL merge the two paths deduplicated by
repository full name, and SHALL enrich item titles with the repository
description when available. The adapter SHALL function without `GITHUB_TOKEN`;
when set, the token SHALL be sent to raise rate limits.

#### Scenario: Markup change is not silent
- **WHEN** the trending page returns HTTP 200 but zero repo blocks parse AND the Search API path also returns nothing
- **THEN** the adapter reports an error naming the parse failure, which appears in the run history

#### Scenario: One path fails, the other delivers
- **WHEN** the trending scrape parses zero blocks but the Search API returns repositories
- **THEN** the adapter returns the API items and logs the scrape failure

#### Scenario: API items carry real publication dates
- **WHEN** a repository arrives via the Search API path
- **THEN** its `published_at` equals the repo's `created_at`, making it subject to the freshness filter and part of the semantic-dedup recent pool

#### Scenario: Title enrichment
- **WHEN** a repository has a description
- **THEN** its item title is `owner/repo — <description (truncated)>` and the full description is the snippet

#### Scenario: Same repo from both paths
- **WHEN** a repository appears in both the scrape and the API results in one run
- **THEN** the adapter returns it once
```

### Tasks

```markdown
## 1. Config
- [ ] 1.1 `GITHUB_TOKEN: z.string().optional()` in envSchema; expose as `news_ingestion.github_token`; document in `.env.example` (optional, raises Search API rate limits)

## 2. Adapter
- [ ] 2.1 In `githubTrending.ts`, split into `fetchTrendingScrape()` (existing logic) and `fetchRecentPopular()` (Search API, `created:>=<UTC date 72h ago>`, per_page=25, GitHub API headers, Bearer token when configured)
- [ ] 2.2 `fetchRecentPopular` maps: `source_id`/URL from `full_name`/`html_url`, `published_at = new Date(created_at)`, `raw_stars_delta = stargazers_count`, snippet = description
- [ ] 2.3 Title enrichment helper: `owner/repo — <description ≤200 chars>` when description present (apply to both paths)
- [ ] 2.4 Merge: run both paths with individual catches; dedupe by repo full name; if merged result is empty AND either path errored (incl. the 0-blocks parse case) → throw with the path errors joined
- [ ] 2.5 Unit tests: 200-but-0-blocks + API-empty → throws; scrape fails + API delivers → items returned; overlap deduped; created date math is UTC

## 3. Verification
- [ ] 3.1 `POST /api/v1/news-items/ingest`: github_trending `fetched ≥ 25` (API path guarantees flow even if scrape is dry)
- [ ] 3.2 Run history: force the parse failure (temporarily break the regex) → error recorded, zero-streak counts it
- [ ] 3.3 Confirm API-path items have `published_at` set and appear in `fetchRecentEmbeddings`' pool on the next run (spot-check Mongo)
- [ ] 3.4 Relevance survival: with brand-voice examples present, confirm >0 github_trending items pass the relevance filter over a 24 h window (run history)
```

---

## Execution order & dependency summary

```
Change 1 (quick wins)          — ship first; label RSS BEFORE feeds populate (hash-safety)
        │
Change 2 (observability)       — prerequisite for verifying 3 & 4 and for the master DoD
        │
   ┌────┴─────┐
Change 3    Change 4           — independent of each other; parallelizable
(reddit)    (github)
```

One OpenSpec change at a time: propose → validate (`openspec validate <id> --strict` if the CLI is available) → apply → verify → archive, then start the next. Changes 3 and 4 may be proposed in parallel but should be applied on separate branches.

## Definition of done (maps to master doc §5)

- [ ] Run history over 24 h shows non-zero `fetched` for: `hackernews`, `devto`, `github_trending`, `reddit`, and at least 3 `rss:<host>` labels including one `rss:medium.com` (baseline today: RSS/Reddit/dev.to = 0)
- [ ] Admin page shows per-source per-layer counts for recent runs; zero-streak alert fires in the controlled invalid-subreddit test
- [ ] Server boots with zero `NEWS_INGESTION_*`/`REDDIT_*`/`GITHUB_*` vars set
- [ ] Every new and pre-existing ingestion env var is documented in `backend/.env.example`
- [ ] Reddit re-verified from the production host, not just this dev machine
