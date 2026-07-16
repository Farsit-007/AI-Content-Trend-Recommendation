# FARSIT — Add More Open-Source News Platforms: OpenSpec Execution Plan

**Problem (as reported):** Add more open-source news platforms for scraping. (Master doc row 2.)
**Parent analysis:** [MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md](./MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md) — Problem 2, §4 Phase 2.
**Source catalog:** [FARSIT-NEWS-PIPELINE-SOURCES.md](./FARSIT-NEWS-PIPELINE-SOURCES.md) — **Part B** (tiered catalog), Part A.4.3–4 (RSS hardening leftovers).
**Sibling plan (already executed):** [RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md](./RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md) — its 4 changes are implemented and archived (`openspec/changes/archive/2026-07-16-*`). This plan builds on that baseline.
**Date:** 2026-07-16

This plan decomposes Part B into **7 OpenSpec changes**, ordered by value/effort so each is independently shippable and verifiable through the (now existing) run-history observability. For each change, run:

```
/opsx:propose   → feed it the change's "Proposal input" + "Spec delta" + "Tasks" sections
/opsx:apply     → implement the generated tasks
verify          → run the change's "Verification" steps
/opsx:archive   → archive when the change's verification passes
```

One change at a time: propose → validate (`openspec validate <id> --strict` if the CLI is available) → apply → verify → archive, then start the next.

---

## 0. Verified baseline (re-checked in code on 2026-07-16 — supersedes stale claims in the catalog doc)

All ingestion code: `backend/src/app/modules/NewsIngestion/`. The catalog doc (Part B) was written **before** the RAVI plan shipped; the following prerequisites it assumes are now DONE and must not be re-proposed:

| Already done (do not redo) | Where |
|---|---|
| Per-feed RSS labels `rss:<hostname>` (`feedLabel`, exported) | `adapters/rss.ts:8-16` |
| Summary/run-count union of adapter names + item labels (`unionSourceKeys`) — any new source label appears in summaries and run history automatically | `newsIngestion.service.ts:41-51` |
| Persisted per-run, per-source, per-layer counts (`IngestionRun`, TTL 30 d) + `GET /api/v1/news-items/ingestion-runs` (admin) with zero-streak alerting | `backend/src/app/modules/IngestionRun/`, `newsItem.route.ts:15` |
| Admin UI renders run history dynamically (any new source label shows up with no frontend change) | `frontend/src/pages/dashboard/Admin.tsx`, `frontend/src/lib/api/ingestionRuns.ts` |
| Reddit OAuth adapter — the reference pattern for token-cached, credential-gated adapters | `adapters/reddit.ts` |
| GitHub two-path merge (`Promise.allSettled`, throw only when everything yielded nothing AND something errored) — the reference pattern for multi-endpoint adapters | `adapters/githubTrending.ts:127-161` |
| dev.to two-call merge + per-call catch — the reference pattern for simple two-endpoint adapters | `adapters/devto.ts:29-39` |
| `.env.example` has a complete `# ---- News ingestion ----` section | `backend/.env.example:79-145` |

Facts that constrain the new work:

| Fact | Location |
|---|---|
| Adapter registry is a static array `{ source, fetch }`; adding a source = 1 file + 1 registry entry. `runAllAdapters` catches a thrown adapter error into `AdapterResult.error`, which lands in run history | `adapters/index.ts:9-15`, `:17-30` |
| An **unconfigured** credential-gated adapter deliberately **throws** a `"<source> not configured (…)"` error (not an empty success) so run history shows an honest reason | `adapters/reddit.ts:98-107` |
| Normalized item shape (`RawNewsItem`): `source, source_id, title, url, snippet?, published_at?, raw_points, raw_comments, raw_stars_delta` | `newsIngestion.interface.ts:1-11` |
| `content_hash = sha256(source + ':' + url)` — **source label and URL are both hash inputs**; changing either for an existing source re-ingests everything as new | `newsIngestion.utils.ts:14-15` |
| Items with no `published_at` bypass the freshness filter AND are excluded from the semantic-dedup recent pool — always set `published_at` when the source provides any date | `newsIngestion.utils.ts:21-24`, `:46-49` |
| Trend score input: `raw_points + 2·raw_comments + 3·raw_stars_delta` (log-scaled downstream) — map each source's engagement onto these three fields | `newsIngestion.utils.ts:51`, `newsIngestion.scoring.ts` |
| Config: zod `envSchema` + exported `news_ingestion` object, both in one file; every ingestion var is optional-with-default (server boots with none set) | `backend/src/app/config/index.ts:68-83`, `:188-211` |
| Redis client: `import { redis } from '../../../lib/redis'` (used by reddit token cache) | `backend/src/app/lib/redis.ts` |
| Tests: jest (`npm test` in `backend/`), files at `backend/src/__tests__/newsIngestion.<name>.test.ts`, mocking `global.fetch` — copy the style of `newsIngestion.devto.test.ts` (plain fetch) and `newsIngestion.reddit.test.ts` (fetch + redis mocks) | `backend/package.json`, `backend/src/__tests__/` |
| HTML-entity decode + tag-strip helpers currently live privately in `githubTrending.ts` | `adapters/githubTrending.ts:18-25`, `:44-45` |
| `openspec/specs/` is still **empty** (no change has ever been synced) — write deltas as full restated requirements, never bare diff fragments | `openspec/specs/` |
| `rss-parser` `Parser` constructor accepts a `timeout` (ms) option; today it is constructed bare (no timeout — one hung feed stalls the whole adapter `Promise.all`) | `adapters/rss.ts:6` |

**Global conventions for all 7 changes (the "no further mistakes" list):**

1. **Capability naming:** all source-behavior deltas go on the existing `news-ingestion` capability (used by every archived ingestion change). New adapters are `ADDED Requirements`; changes to existing adapters/pipeline behavior are `MODIFIED Requirements` with full restated text.
2. **New-adapter checklist** (every adapter change below follows it; the proposal's tasks must include all 7 items):
   1. New file `backend/src/app/modules/NewsIngestion/adapters/<name>.ts` exporting `fetch<Name>(): Promise<RawNewsItem[]>`.
   2. Register in the `ADAPTERS` array (`adapters/index.ts`) with a snake_case `source` name.
   3. Any new env vars: optional-with-safe-default in `envSchema` **and** the exported `news_ingestion` block **and** documented in `backend/.env.example` (server must boot with none set).
   4. Failure discipline: per-sub-resource (one instance, one query, one endpoint) failures are caught inside the adapter and logged, returning partial results; the adapter throws only when it produced nothing AND something actually errored (copy `githubTrending.ts:127-161`), or when required credentials are unset (copy `reddit.ts:98-107` — throw `"<source> not configured (…)"`).
   5. Set `published_at` from the source's real timestamp whenever one exists (UTC, epoch-based — never format/parse local dates). Send a descriptive `User-Agent` (`GrowthStudioBot/1.0` style) on every request.
   6. Per-source fetch cap ≤ 50 items/run (cost guardrail — see §"Cost discipline" below).
   7. Unit test file `backend/src/__tests__/newsIngestion.<name>.test.ts` mocking `global.fetch` (and `redis` where used).
3. **Run-history integration is free.** Do NOT add any observability plumbing — new source labels flow into summaries, `IngestionRun` docs, zero-streak alerting, and the Admin UI automatically via `unionSourceKeys`. Verification of every change reads `GET /api/v1/news-items/ingestion-runs`.
4. **Never change** `content_hash` semantics, the `source` label of an existing source, the 0.88 semantic threshold, or `RawNewsItem`'s shape. (The one deliberate exception — keeping the `hackernews` label identical through the Algolia migration — is Change 2's central requirement.)
5. **Cost discipline:** every unique fetched item costs one embedding call, and every stored item costs a share of an LLM categorization batch (batches of 10, `newsIngestion.categorize.ts`). Tier-1+2 sources at the caps below add ≤ ~200 fetched items/run *before* dedup. Keep the total RSS feed list ≤ 25 feeds (catalog Tier-3 caveat). If post-ship run history shows per-run embedding volume doubling, trim caps before adding the next source.
6. **ToS discipline:** every source below is an official/public API or explicit RSS endpoint (catalog Part B selection rule). No retries/hammering; respect published rate limits (all are trivially satisfied at 8 runs/day). Do not add anything from the catalog's "Deliberately excluded" list (Twitter/X, daily.dev, Medium clap scraping, LinkedIn, headless-browser anything).
7. **Out of scope for this plan** (other problems' plans): retention/TTL on `news_items`, tombstone ledger, engagement re-polling, update-aware dedup/story chains, relevance flag-don't-drop (catalog C.3).

---

## Change 1 — `lobsters-adapter`

**Catalog:** Part B Tier 1, row 1. **Effort:** ~2–3 h. **No credentials, no new env vars.** Highest signal-to-noise per line of code — ship first.

### Proposal input (for `/opsx:propose`)

**Why:** The pipeline's only high-signal developer-community source is Hacker News. Lobsters (lobste.rs) is the second-best such community, has an official, stable, unauthenticated JSON API, carries real engagement signals (`score`, `comment_count`) that feed `trend_score`, and costs one HTTP request per run.

**What changes:**
- New adapter `lobsters` fetching `https://lobste.rs/hottest.json` (~25 stories/call) and normalizing to `RawNewsItem`.
- Engagement mapping: `score → raw_points`, `comment_count → raw_comments`, `raw_stars_delta = 0`.
- Text posts (empty `url` field) use the story's `comments_url` as the item URL.
- Shared HTML-text helper: extract the entity-decode + tag-strip logic currently private in `githubTrending.ts` into `adapters/htmlText.ts` and reuse it for Lobsters' HTML `description` field (behavior of the GitHub adapter unchanged).

**Capabilities:** MODIFIED `news-ingestion` (spec-wise an ADDED requirement on the existing capability).

**Impact:**
- New: `backend/src/app/modules/NewsIngestion/adapters/lobsters.ts`, `backend/src/app/modules/NewsIngestion/adapters/htmlText.ts`.
- `backend/src/app/modules/NewsIngestion/adapters/index.ts` — register `{ source: 'lobsters', fetch: fetchLobsters }`.
- `backend/src/app/modules/NewsIngestion/adapters/githubTrending.ts` — import the extracted helpers (no behavior change).
- New test: `backend/src/__tests__/newsIngestion.lobsters.test.ts`.
- No config/env changes.

### Design decisions

1. **`hottest.json` only, not `newest.json`.** Hottest is quality-ranked by the community; newest is an unmoderated firehose that would mostly die at the relevance filter while still costing embeddings. The catalog lists both; deliberately take only hottest. (Revisit only if run history later shows lobsters `stored` ≈ 0 while `fetched` > 0.)
2. **Field mapping** (Lobsters story object): `source: 'lobsters'`, `source_id: short_id`, `title: title`, `url: url || comments_url` (Lobsters text posts have `url: ""`), `snippet:` tag-stripped + entity-decoded `description` truncated to 500 chars (mirrors reddit's `selftext.slice(0, 500)`), `published_at: new Date(created_at)`, `raw_points: score`, `raw_comments: comment_count`.
3. **Story `tags`** (e.g. `["ai", "web"]`) are appended to the snippet as plain words when a description is absent — cheap extra embedding signal for the relevance filter, same motivation as GitHub title enrichment.
4. **Failure:** single endpoint — a non-OK response or fetch error throws (adapter registry converts it to the run's `error` for `lobsters`). No partial-result machinery needed.
5. **helper extraction is mechanical:** `htmlText.ts` exports `decodeEntities` and `stripHtml` with the exact current implementations from `githubTrending.ts:18-25` and the `replace(/<[^>]+>/g, '')` at `:45`; GitHub adapter's tests (already existing) guard the refactor.

### Spec delta (capability `news-ingestion`)

```markdown
## ADDED Requirements

### Requirement: Lobsters Source
The pipeline SHALL include a `lobsters` adapter that fetches the Lobsters hottest
stories JSON endpoint once per run and normalizes each story with its community
engagement signals (`score` as points, `comment_count` as comments), its real
submission timestamp as `published_at`, and — for text posts without an external
URL — the story's comments page as the item URL.

#### Scenario: Hottest stories are normalized with engagement
- **WHEN** the adapter fetches `https://lobste.rs/hottest.json` and receives a story with `score: 42` and `comment_count: 7`
- **THEN** the emitted item has `source: "lobsters"`, `raw_points: 42`, `raw_comments: 7`, and `published_at` equal to the story's `created_at`

#### Scenario: Text post without external URL
- **WHEN** a fetched story has an empty `url` field
- **THEN** the emitted item's `url` is the story's `comments_url`

#### Scenario: Endpoint failure is visible
- **WHEN** the hottest endpoint returns a non-OK status
- **THEN** the adapter throws, and the run history records the error for source `lobsters`
```

### Tasks

```markdown
## 1. Shared HTML-text helper
- [ ] 1.1 Create `adapters/htmlText.ts` exporting `decodeEntities(text: string): string` and `stripHtml(html: string): string` (implementations lifted verbatim from `githubTrending.ts:18-25` and `:45`)
- [ ] 1.2 Refactor `githubTrending.ts` to import them; run existing `newsIngestion.githubTrending.test.ts` to confirm zero behavior change

## 2. Adapter
- [ ] 2.1 Create `adapters/lobsters.ts`: `fetchLobsters()` GETs `https://lobste.rs/hottest.json` with a `GrowthStudioBot/1.0`-style User-Agent; throw on non-OK
- [ ] 2.2 Map fields per design decision 2 (incl. `url || comments_url` fallback and 500-char snippet cap); append tags to snippet when description is empty
- [ ] 2.3 Register `{ source: 'lobsters', fetch: fetchLobsters }` in `adapters/index.ts`

## 3. Tests
- [ ] 3.1 `newsIngestion.lobsters.test.ts` (mock `global.fetch`, copy devto test style): engagement mapping; text-post URL fallback; HTML description stripped; non-OK response throws

## 4. Verification
- [ ] 4.1 `cd backend && npm test && npm run build`
- [ ] 4.2 `POST /api/v1/news-items/ingest` (admin JWT) → run summary shows `lobsters` with `fetched ≈ 25`
- [ ] 4.3 `GET /api/v1/news-items/ingestion-runs` → the run's `sources` contains a `lobsters` row with balanced layer counts
- [ ] 4.4 Spot-check one stored item: `source: 'lobsters'`, `published_at` set, engagement present
```

**Pitfalls:** don't fetch `newest.json`; don't invent an env var to configure the URL (YAGNI — no other credential-free single-endpoint adapter has one); `description` is HTML — store the stripped form, never raw markup.

---

## Change 2 — `hn-algolia-migration`

**Catalog:** Part B Tier 1, row 2 (= master doc step 0.3, deferred by the RAVI plan). **Effort:** ~3–4 h.
**This is a MODIFICATION of an existing source. The whole change hinges on one invariant: `content_hash` compatibility.**

### Why now (and why it was deferred before)

The current HN adapter makes **31 requests per run** (`topstories.json` + 30 item fetches, `adapters/hackerNews.ts:17-28`). That was tolerable when HN was the only healthy source; as this plan multiplies adapter count, HN should shrink to its fair share. Algolia's official HN API returns the same stories in **2 requests** and adds a "risers" query (`points>50` by date) that catches stories gaining traction between front-page snapshots — a genuine trend-detection win, not just a cleanup.

### The hash-compatibility invariant (read before proposing)

`content_hash = sha256('hackernews' + ':' + url)`. Every already-stored HN item was hashed from: `item.url` when the story has an external link, else `https://news.ycombinator.com/item?id=<id>` (`hackerNews.ts:36`). Algolia's `url` field is the **same submitted URL**, and the same fallback format must be kept for URL-less stories (Ask HN etc.). If both hold, stored items keep deduping correctly across the migration and nothing re-ingests. **The `source` label stays exactly `'hackernews'` and `source_id` stays the HN numeric id as a string.** Any deviation re-ingests the entire HN backlog as duplicates on the next run.

### Proposal input

**Why:** The Hacker News adapter costs 31 HTTP requests per run for 30 stories and only sees front-page snapshots, missing stories that rise between the 3-hourly runs. Algolia's official HN search API delivers the front page in one request and rising stories in a second, at 10k requests/hour unauthenticated.

**What changes:**
- Rewrite `adapters/hackerNews.ts` internals to call `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30` and `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E50&hitsPerPage=50`, merged and deduplicated by `objectID`.
- Per-call catch + throw-only-if-both-fail (devto pattern).
- Output identical in shape and identity to today: `source: 'hackernews'`, `source_id: objectID`, `url: hit.url ?? 'https://news.ycombinator.com/item?id=' + objectID`, `points → raw_points`, `num_comments → raw_comments`, `published_at: new Date(created_at_i * 1000)`, `snippet: story_text` (stripped via `htmlText.ts`).

**Capabilities:** MODIFIED `news-ingestion`.

**Impact:** `adapters/hackerNews.ts` (rewrite, same exported name `fetchHackerNews`, same file); test updates in `backend/src/__tests__/` (a HN test file may not exist yet — create `newsIngestion.hackernews.test.ts`). No config, registry, or frontend changes.

### Design decisions

1. **Both queries, one adapter, dedupe by `objectID`** (Map, front-page hit wins so the better-established engagement numbers stick).
2. **`numericFilters=points%3E50`** — the `>` must be URL-encoded; unencoded it still works in some clients but is malformed. Encode explicitly.
3. **Keep the 30/50 caps** as file-local constants (like today's `TOP_STORY_COUNT`) — not env vars.
4. **`created_at_i`** (epoch seconds) is authoritative for `published_at`; Algolia also has ISO `created_at`, but epoch avoids any parsing ambiguity (UTC rule).
5. **Depends on Change 1 only for `htmlText.ts`** (snippet stripping). If applied before Change 1, inline the strip locally — but the planned order makes it available.

### Spec delta (capability `news-ingestion`)

```markdown
## MODIFIED Requirements

### Requirement: Hacker News Source via Algolia With Hash-Compatible Identity
The Hacker News adapter SHALL fetch the current front page and recent
high-scoring stories (points > 50, by date) from the official Algolia HN API in
two requests total, merged and deduplicated by story id. Emitted items SHALL be
identity-compatible with items ingested by the previous Firebase-based adapter:
`source` remains `hackernews`, `source_id` remains the HN item id, and the item
URL remains the story's submitted URL, falling back to
`https://news.ycombinator.com/item?id=<id>` for stories without one — so that
`content_hash` values are unchanged across the migration.

#### Scenario: Front page fetched in one request
- **WHEN** the adapter runs
- **THEN** it issues exactly one `search?tags=front_page` request and one `search_by_date?tags=story&numericFilters=points>50` request, and a story present in both responses appears once in the output

#### Scenario: Hash compatibility with previously stored items
- **WHEN** a story that the old Firebase adapter already stored reappears via Algolia
- **THEN** its computed `content_hash` is identical to the stored one and the item is hash-deduped, not re-ingested

#### Scenario: URL-less story fallback
- **WHEN** a fetched story has no `url` field
- **THEN** the item URL is `https://news.ycombinator.com/item?id=<objectID>`

#### Scenario: One Algolia query fails
- **WHEN** the front-page request fails but the risers request succeeds
- **THEN** the adapter logs the failure and returns the risers' items instead of throwing
```

### Tasks

```markdown
## 1. Adapter rewrite
- [ ] 1.1 In `adapters/hackerNews.ts`, replace the Firebase flow with `fetchStories(url)` (per-call try/catch returning `null`, devto pattern) called for the two Algolia URLs (constants; `%3E` encoding for `points>50`)
- [ ] 1.2 Merge by `objectID` (front-page hit wins); throw only if both calls returned null
- [ ] 1.3 Map per design: source/source_id/url-fallback identical to the old adapter; `created_at_i*1000 → published_at`; `story_text` stripped via `htmlText.ts` → snippet

## 2. Tests
- [ ] 2.1 `newsIngestion.hackernews.test.ts`: merge/dedupe by objectID; URL fallback format matches `https://news.ycombinator.com/item?id=<id>` exactly; one-call-failure survives; both-fail throws
- [ ] 2.2 Hash-compat test: `computeContentHash('hackernews', <algolia item url>)` equals the hash of the same story mapped through the old rules (fixture with and without `url`)

## 3. Verification
- [ ] 3.1 `npm test && npm run build`
- [ ] 3.2 Manual ingest → run history shows `hackernews` `fetched` between ~30 and ~80 (front page + risers) — and, crucially, `hash_deduped` is HIGH on the run immediately after migration (stored front-page items dedupe → proves hash compatibility); `stored` is NOT ≈ fetched
- [ ] 3.3 Confirm no duplicate HN titles appear in the feed UI after two post-migration runs
```

**Pitfalls:** verification 3.2 is the migration's smoke alarm — if the first post-migration run *stores* nearly everything it fetched from the front page, hashes diverged: stop and fix before the next cron fires. Don't rename the file, the export, or the source label. Don't add `search_by_date` pagination.

---

## Change 3 — `mastodon-trending-adapter`

**Catalog:** Part B Tier 1, row 4. **Effort:** ~3–4 h. **No credentials; one optional env var.**

### Proposal input

**Why:** Every current source measures engagement *inside* one community. Mastodon's public trending-links endpoint measures *what articles people are sharing right now* across the fediverse — a true real-time, cross-site trend signal — with no auth, and the shared URLs are external articles that enrich cross-source dedup (the same story arriving from HN/RSS/Mastodon collapses via semantic dedup, keeping the highest-engagement copy).

**What changes:**
- New adapter `mastodon` fetching `https://<instance>/api/v1/trends/links` from each configured instance.
- New optional env var `NEWS_INGESTION_MASTODON_INSTANCES` (comma-separated hostnames, default `mastodon.social,fosstodon.org`); empty value disables the adapter (throws "not configured" so run history shows why, reddit pattern).
- Cross-instance merge deduplicated by link URL, keeping the copy with higher share counts.
- Engagement mapping: today's `history[0].accounts` (distinct sharers) → `raw_points`, `history[0].uses` is ignored (correlated; accounts is the less-gameable number). **These arrive as strings** — coerce with `Number()`.
- `published_at` = fetch time (design decision 3).

**Capabilities:** MODIFIED `news-ingestion` (ADDED requirement).

**Impact:**
- New: `adapters/mastodon.ts`; registry entry `{ source: 'mastodon', fetch: fetchMastodon }`.
- `backend/src/app/config/index.ts` — `NEWS_INGESTION_MASTODON_INSTANCES` in `envSchema` (string, default `'mastodon.social,fosstodon.org'`) + parsed array `news_ingestion.mastodon_instances`.
- `backend/.env.example` — document it.
- New test: `newsIngestion.mastodon.test.ts`.

### Design decisions

1. **Default-enabled.** Unlike Reddit/Product Hunt there are no credentials, so the safe default is a working default (like HN and dev.to). The env var exists to swap instances or disable (`NEWS_INGESTION_MASTODON_INSTANCES=` empty → adapter throws `'mastodon not configured (NEWS_INGESTION_MASTODON_INSTANCES is empty)'`).
2. **Two default instances, not three:** each instance is one request; two large general instances (mastodon.social, fosstodon.org — the latter tech-focused) give complementary coverage. Operators can add more.
3. **`published_at` = fetch time.** Trending links carry no publication date. Leaving it `undefined` would (a) bypass freshness forever and (b) exclude these items from the semantic-dedup recent pool (`newsIngestion.utils.ts:46-49`) — the exact hole the GitHub hardening change closed for API items. "Trending now" makes fetch-time an honest timestamp. Re-fetches of the same URL on later runs are hash-deduped anyway.
4. **Identity:** `source_id` = the link URL (the API has no id field); `source: 'mastodon'` flat (per-instance labels would fragment the same article's identity across instances and change nothing for health monitoring — instance failures are logged per-instance).
5. **Mapping:** `title` = card `title`; `snippet` = card `description` (plain text per API, but run through `stripHtml` defensively); `raw_points = Number(history?.[0]?.accounts ?? 0)`; `raw_comments = 0`; `raw_stars_delta = 0`.
6. **Per-instance catch** (one instance down ⇒ others still deliver); throw only if **all** instances failed (allSettled + "nothing AND an error" rule).
7. **Rate limits:** 300 req/5 min per instance; we make 1. No limiter needed.

### Spec delta (capability `news-ingestion`)

```markdown
## ADDED Requirements

### Requirement: Mastodon Trending-Links Source
The pipeline SHALL include a `mastodon` adapter that fetches the public
trending-links endpoint of each instance configured in
`NEWS_INGESTION_MASTODON_INSTANCES` (default `mastodon.social,fosstodon.org`),
merges results across instances deduplicated by link URL (keeping the copy with
the higher sharer count), maps today's distinct-sharer count to `raw_points`
(coercing the API's string values to numbers), and sets `published_at` to fetch
time so items participate in freshness filtering and the semantic-dedup pool.
When the instance list is configured empty, the adapter SHALL report itself
unconfigured instead of fetching. The server SHALL boot with the variable unset.

#### Scenario: Trending links normalized with share counts
- **WHEN** an instance returns a trending link with `history[0].accounts: "57"`
- **THEN** the emitted item has `source: "mastodon"`, `raw_points: 57`, and a `published_at` within the current run

#### Scenario: Same link trending on two instances
- **WHEN** both configured instances return the same URL with sharer counts "40" and "25"
- **THEN** the adapter emits that URL once with `raw_points: 40`

#### Scenario: One instance is down
- **WHEN** one instance request fails and the other succeeds
- **THEN** the adapter logs the failure and returns the successful instance's items

#### Scenario: Disabled by configuration
- **WHEN** `NEWS_INGESTION_MASTODON_INSTANCES` is set to an empty value
- **THEN** the adapter makes no network calls and the run history records a "not configured" reason for source `mastodon`
```

### Tasks

```markdown
## 1. Config
- [ ] 1.1 `envSchema`: `NEWS_INGESTION_MASTODON_INSTANCES: z.string().default('mastodon.social,fosstodon.org')`; export parsed array as `news_ingestion.mastodon_instances` (same split/trim/filter as `rss_feeds`, `config/index.ts:189-192`)
- [ ] 1.2 Document in `.env.example` under the news-ingestion section (default, how to disable, that no credentials are needed)

## 2. Adapter
- [ ] 2.1 `adapters/mastodon.ts`: throw 'not configured' when the instance list is empty; else `Promise.allSettled` over `https://<instance>/api/v1/trends/links` (User-Agent header, 20-item response typical)
- [ ] 2.2 Merge across instances by URL keeping max `accounts`; map fields per design 4–5 (`Number()` coercion, `published_at: new Date()`)
- [ ] 2.3 All-instances-failed → throw with joined reasons (githubTrending merge pattern)
- [ ] 2.4 Register `{ source: 'mastodon', fetch: fetchMastodon }` in `adapters/index.ts`

## 3. Tests
- [ ] 3.1 `newsIngestion.mastodon.test.ts`: string→number coercion; cross-instance URL dedupe keeps higher count; one-down-one-up; empty config throws without fetch calls; all-failed throws

## 4. Verification
- [ ] 4.1 `npm test && npm run build`; boot with the var unset (default applies) and with it set empty (clean boot, run shows mastodon 'not configured')
- [ ] 4.2 Manual ingest → run history: `mastodon` fetched ≈ 20–40; spot-check a stored item has fetch-time `published_at` and non-zero `raw_points`
- [ ] 4.3 Next-run check: previously stored mastodon URLs show up as `hash_deduped`, not re-stored
```

**Pitfalls:** `history` values are strings — forgetting `Number()` makes `raw_points` become `NaN` and poisons `trend_score` (the log-scale math silently yields `NaN` opportunity scores). `trends/links` can be empty on small instances (legit empty ≠ error — return `[]`, don't throw).

---

## Change 4 — `rss-fleet-expansion`

**Catalog:** Part B Tier 2 rows "Google News excepted" (GitHub Releases feeds), Tier 2 arXiv, Tier 3 (editorial feeds), plus the Part A.4.4 timeout leftover. **Effort:** ~2–3 h, mostly config. **Zero new adapters — this is the payoff of the already-shipped per-feed labeling.**

### Proposal input

**Why:** The RSS adapter is live with per-feed labels but carries only 8 starter feeds. The catalog's Tier-3 editorial sources, GitHub Releases feeds (version-release stories for watched tools), and arXiv (Atom — parseable by the existing adapter, no code) can all ship as pure feed-list config. Separately, the adapter still has no per-feed timeout: one hung feed stalls the entire adapter's `Promise.all` indefinitely (the pipeline has no adapter-level timeout at all).

**What changes:**
- Construct the `rss-parser` with a 10-second timeout (`new Parser({ timeout: 10_000 })`, `adapters/rss.ts:6`) so a hung feed fails that feed only (the existing per-feed catch already isolates it).
- Expand the curated feed list in `backend/.env.example` (and operator `.env`) to ≤ 25 feeds spanning: existing 8 + editorial (InfoQ, The New Stack, Smashing Magazine, Stack Overflow blog, Cloudflare blog, The Changelog, MIT Tech Review) + GitHub Releases Atom feeds for watched tools (react, next.js, node, typescript, tailwindcss) + one arXiv Atom query (cs.AI, newest, 25 results).
- Document the cost guardrail (≤ 25 feeds) and the per-label alert semantics next to the var.

**Capabilities:** MODIFIED `news-ingestion` (RSS operational requirement).

**Impact:** `adapters/rss.ts` (one line), `backend/.env.example`, `backend/.env` (operator step). No schema, no new module, no frontend.

### Design decisions

1. **Conditional GET (catalog A.4.3) is deliberately NOT included.** Reason: a feed answering `304 Not Modified` would legitimately yield `fetched: 0` for its label, which the shipped zero-streak alert (3 consecutive zero-fetch runs) would misread as a dead source — quiet-but-healthy feeds would alert permanently. Making 304 distinguishable requires plumbing per-feed status through `AdapterResult` into the `IngestionRun` schema — real scope, negligible payoff at ~200 requests/day. Revisit only if feed count grows past ~50. Record this as a design note in the change so nobody "helpfully" adds it later.
2. **Feed list (final, 21 feeds):** the 8 existing + `https://feed.infoq.com/`, `https://thenewstack.io/feed/`, `https://www.smashingmagazine.com/feed/`, `https://stackoverflow.blog/feed/`, `https://blog.cloudflare.com/rss/`, `https://changelog.com/feed`, `https://www.technologyreview.com/feed/`, `https://github.com/facebook/react/releases.atom`, `https://github.com/vercel/next.js/releases.atom`, `https://github.com/nodejs/node/releases.atom`, `https://github.com/microsoft/typescript/releases.atom`, `https://github.com/tailwindlabs/tailwindcss/releases.atom`, `http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=25`.
3. **All five GitHub Releases feeds share the label `rss:github.com`** (labels are hostname-derived). Acceptable: they fail/succeed together operationally. Do NOT extend `feedLabel` to include paths — the label is a `content_hash` input (`newsIngestion.utils.ts:14`) and RSS items are now stored under hostname labels; changing labeling re-ingests everything as duplicates. This is the plan's single most important don't.
4. **arXiv ToS** (max 1 request / 3 s) is satisfied: one query per run. Do not add more arXiv category feeds — combine categories into the one query (`cat:cs.AI+OR+cat:cs.LG`) if ever needed.
5. **Release feeds and arXiv have no engagement signal** (`raw_points: 0` — already the RSS adapter's behavior): they compete on relevance alone, which is correct (a Tailwind release matters to a dev-brand voice regardless of votes).

### Spec delta (capability `news-ingestion`)

```markdown
## MODIFIED Requirements

### Requirement: RSS Fleet With Per-Feed Timeout and Curated Coverage
The RSS adapter SHALL apply a 10-second per-feed fetch timeout so a hung feed
fails only itself, with remaining feeds unaffected. The documented starter feed
list SHALL cover editorial technology press, engineering blogs, GitHub release
Atom feeds for widely-used developer tools, and an arXiv cs.AI Atom query, and
SHALL be capped at 25 feeds with the cost rationale documented alongside the
variable.

#### Scenario: Hung feed cannot stall the run
- **WHEN** one configured feed accepts the connection but never responds
- **THEN** that feed errors after ~10 seconds and items from all other feeds are returned

#### Scenario: Atom feeds parse through the existing adapter
- **WHEN** a GitHub `releases.atom` feed and the arXiv query URL are configured
- **THEN** their entries are ingested with `published_at` from the feed entries and labels `rss:github.com` and `rss:export.arxiv.org`
```

### Tasks

```markdown
## 1. Timeout
- [ ] 1.1 `adapters/rss.ts:6` → `new Parser({ timeout: 10_000 })`
- [ ] 1.2 Test (extend `newsIngestion.rss.test.ts`): parser constructed with a timeout (assert constructor arg via the existing rss-parser mock)

## 2. Feed list
- [ ] 2.1 Replace the `NEWS_INGESTION_RSS_FEEDS` value in `.env.example` with the 21-feed list (design decision 2) and extend the comment: ≤25-feed cap + why (embedding/LLM cost scales with fetch volume), release feeds share the rss:github.com label, arXiv is one combined query by ToS
- [ ] 2.2 Add the design-decision note that conditional GET is intentionally absent (zero-streak interaction) as a comment in `adapters/rss.ts`
- [ ] 2.3 Operator step: set the same list in local/production `.env` (gitignored)

## 3. Verification
- [ ] 3.1 `npm test && npm run build`
- [ ] 3.2 Manual ingest → run history shows new labels incl. `rss:github.com`, `rss:export.arxiv.org`, `rss:thenewstack.io` with fetched > 0 and `published_at` set on stored items
- [ ] 3.3 Confirm total per-run fetched volume stays < ~400 items (cost guardrail)
```

**Pitfalls:** never touch `feedLabel` (hash input — see design 3); the arXiv URL contains `&` but no commas, so the comma-split env parsing is safe — do not "fix" the parser; a wrong feed URL fails soft per-feed (existing catch) and will show as an alerting label, which is the system working.

---

## Change 5 — `product-hunt-adapter`

**Catalog:** Part B Tier 1, row 3. **Effort:** ~1 day incl. one-time registration. **Credential-gated (reddit pattern).**

### One-time manual prerequisite (do first — cannot be automated)

Create an application at https://www.producthunt.com/v2/oauth/applications (any redirect URI, e.g. `http://localhost:3001`). Capture the API client id + secret. Without them the adapter self-disables cleanly.

### Proposal input

**Why:** "New AI tool launched today" is the single strongest content-angle class for a growth-marketing team, and no current source covers product launches. Product Hunt's official GraphQL API v2 exposes daily top launches with vote/comment engagement, free, via OAuth2 client-credentials.

**What changes:**
- New adapter `producthunt`: OAuth2 client-credentials token (`POST https://api.producthunt.com/v2/oauth/token`, JSON body `{client_id, client_secret, grant_type: "client_credentials"}`) cached in Redis (`producthunt:app_token`, TTL 24 h); GraphQL query for the last 24 h's top-voted posts.
- New optional env vars `PRODUCTHUNT_CLIENT_ID`, `PRODUCTHUNT_CLIENT_SECRET`; unset → adapter throws `'producthunt not configured (…)'` without network calls (reddit pattern, `reddit.ts:98-107`).
- On GraphQL-endpoint 401: invalidate cached token, refresh, retry exactly once (reddit pattern, `reddit.ts:86-96`).
- Engagement: `votesCount → raw_points`, `commentsCount → raw_comments`.

**Capabilities:** MODIFIED `news-ingestion` (ADDED requirement).

**Impact:**
- New: `adapters/producthunt.ts`; registry entry `{ source: 'producthunt', fetch: fetchProductHunt }`.
- `config/index.ts`: two optional vars in `envSchema` + `news_ingestion.producthunt: { client_id, client_secret }`.
- `.env.example`: vars + registration steps.
- Uses `redis` from `backend/src/app/lib/redis.ts`.
- New test: `newsIngestion.producthunt.test.ts` (fetch + redis mocks — copy reddit test).

### Design decisions

1. **GraphQL query** (single POST, `Authorization: Bearer <token>`, `Content-Type: application/json`):
   ```graphql
   query TopLaunches($postedAfter: DateTime!) {
     posts(order: VOTES, postedAfter: $postedAfter, first: 25) {
       edges { node { id name tagline url votesCount commentsCount createdAt } }
     }
   }
   ```
   `postedAfter` = ISO string of `Date.now() − 24 h` (UTC). 24 h, not 72: PH is a daily-leaderboard site; the 3-hourly cron re-fetches the same day's board and hash dedup drops repeats — same dynamics as dev.to's daily top, already proven fine.
2. **Mapping:** `source: 'producthunt'`, `source_id: node.id`, `title: `${name} — ${tagline}`` (tagline is the semantic payload; a bare product name would starve at the relevance filter — same lesson as GitHub title enrichment), `url: node.url` (PH post page — stable, canonical), `snippet: tagline`, `published_at: new Date(createdAt)`.
3. **Token TTL 24 h fixed:** PH client-credentials tokens are long-lived and the token response's expiry semantics are not contractual — a daily re-auth is one request and always safe. On 401, the retry-once path handles early revocation.
4. **Rate limits:** complexity-based, 450 points/15 min; this query is one shallow page — negligible. No limiter.
5. **GraphQL errors arrive as HTTP 200 with an `errors` array** — treat a response containing `errors` (or missing `data.posts`) as a thrown failure with the first error message. This is the non-obvious GraphQL gotcha; a REST-minded implementation would silently emit zero items.

### Spec delta (capability `news-ingestion`)

```markdown
## ADDED Requirements

### Requirement: Product Hunt Source via OAuth2 Client Credentials
The pipeline SHALL include a `producthunt` adapter that authenticates with the
Product Hunt API v2 via the OAuth2 client-credentials grant using
`PRODUCTHUNT_CLIENT_ID`/`PRODUCTHUNT_CLIENT_SECRET`, caches the bearer token in
Redis for 24 hours, and fetches the top-voted posts of the last 24 hours via one
GraphQL query, mapping votes to points and comments to comments and enriching
the item title with the product tagline. A GraphQL response carrying an
`errors` array SHALL be treated as a failure. On HTTP 401 the adapter SHALL
invalidate the cached token and retry once. When credentials are not configured
the adapter SHALL make no network calls and report itself unconfigured, and the
server SHALL boot normally.

#### Scenario: Launches normalized with engagement
- **WHEN** the adapter runs with valid credentials and a post has `votesCount: 312`, `commentsCount: 41`
- **THEN** the emitted item has `source: "producthunt"`, `raw_points: 312`, `raw_comments: 41`, title `"<name> — <tagline>"`, and `published_at` from `createdAt`

#### Scenario: Token cached across runs
- **WHEN** a second run starts within 24 hours
- **THEN** the adapter reuses the Redis-cached token without calling the token endpoint

#### Scenario: Expired token
- **WHEN** the GraphQL request returns HTTP 401
- **THEN** the adapter invalidates the cache, obtains a fresh token, and retries the query exactly once

#### Scenario: GraphQL-level error
- **WHEN** the GraphQL response is HTTP 200 but contains an `errors` array
- **THEN** the adapter throws with the error message and the run history records it

#### Scenario: Credentials absent
- **WHEN** `PRODUCTHUNT_CLIENT_ID` or `PRODUCTHUNT_CLIENT_SECRET` is unset
- **THEN** the adapter makes no network requests and the run's `producthunt` entry shows a "not configured" reason
```

### Tasks

```markdown
## 1. Config
- [ ] 1.1 `envSchema`: `PRODUCTHUNT_CLIENT_ID: z.string().optional()`, `PRODUCTHUNT_CLIENT_SECRET: z.string().optional()`; export `news_ingestion.producthunt: { client_id, client_secret }`
- [ ] 1.2 `.env.example`: document both + registration steps (oauth/applications URL, script-style app, any redirect URI)

## 2. Adapter
- [ ] 2.1 `adapters/producthunt.ts`: unconfigured guard (throw 'not configured', no fetch); `getAppToken()` with Redis `GET`/`SET ... EX 86400` on `producthunt:app_token` (mirror `reddit.ts:51-59`)
- [ ] 2.2 `fetchTopLaunches(token)`: GraphQL POST per design 1; map per design 2; `errors`-array and missing-`data` handling per design 5; 401 → `PHAuthError` → invalidate + retry once (mirror `reddit.ts:86-96`)
- [ ] 2.3 Register `{ source: 'producthunt', fetch: fetchProductHunt }` in `adapters/index.ts`

## 3. Tests
- [ ] 3.1 `newsIngestion.producthunt.test.ts` (mock fetch + redis, copy reddit test style): mapping incl. title enrichment; token cached/reused; 401 → refresh → retry once; 200-with-errors-array throws; unconfigured → zero fetch calls

## 4. Verification
- [ ] 4.1 `npm test && npm run build`; boot with no PRODUCTHUNT_* vars → clean boot, run history shows 'not configured'
- [ ] 4.2 With real credentials: manual ingest → `producthunt` fetched ≈ 25; second run reuses token (redis TTL check) and hash-dedupes yesterday's board
```

**Pitfalls:** the `errors`-array-in-200 gotcha (design 5) is where a naive implementation silently produces the exact invisible-dead-source failure this whole program exists to kill; `postedAfter` must be ISO-8601 UTC (`new Date(...).toISOString()`), never a formatted local date.

---

## Change 6 — `stackoverflow-hot-adapter`

**Catalog:** Part B Tier 2, last row. **Effort:** ~2–3 h. **No credentials required; one optional env var for quota.**

### Proposal input

**Why:** "What developers are struggling with today" is a distinct content-idea signal none of the other sources carry (they're all news/launches). The Stack Exchange API's hot-questions endpoint is official, keyless (300 req/day per IP — we need 8), and carries engagement (`score`, `answer_count`).

**What changes:**
- New adapter `stackoverflow`: `GET https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=25` (+ `&key=` when `STACKEXCHANGE_KEY` is set).
- New optional env var `STACKEXCHANGE_KEY` (raises quota 300/day → 10k/day; absent = fully functional).
- Mapping: `question_id → source_id` (string), `link → url`, entity-decoded `title` (SE API HTML-encodes titles), `tags.join(', ') → snippet`, `creation_date (epoch s) → published_at`, `score → raw_points`, `answer_count → raw_comments`.
- Honor the API's `backoff` field by logging a warning (at 8 req/day, backoff will essentially never fire; never sleep-loop in an adapter).

**Capabilities:** MODIFIED `news-ingestion` (ADDED requirement).

**Impact:** new `adapters/stackoverflow.ts` + registry entry; `config/index.ts` + `.env.example` for `STACKEXCHANGE_KEY`; test `newsIngestion.stackoverflow.test.ts`.

### Design decisions

1. **Titles are HTML-entity-encoded** (`&quot;`, `&#39;` …) — decode with `decodeEntities` from `htmlText.ts` (Change 1). Undecoded entities pollute both the feed UI and the embedding text.
2. **Snippet = tags.** Question bodies aren't in the default response filter and fetching them costs quota + noise; the tag list (`javascript, react, hooks`) is compact, high-signal embedding text — same philosophy as GitHub title enrichment.
3. **Hot ≠ new:** hot questions can be older than 72 h; `filterFresh` will drop those. Correct behavior — do not special-case (`published_at` must stay honest, per baseline rules).
4. **Response is gzipped always** — Node's built-in `fetch` transparently decompresses; do not add manual gzip handling (a common stale-Stack-Overflow-answer mistake from the request/axios era).
5. **`items` may be absent on API-level errors** (SE returns `error_id/error_message` JSON with 400) — non-OK status or missing `items` array throws with `error_message` when present.

### Spec delta (capability `news-ingestion`)

```markdown
## ADDED Requirements

### Requirement: Stack Overflow Hot-Questions Source
The pipeline SHALL include a `stackoverflow` adapter that fetches the Stack
Exchange hot-questions listing for the stackoverflow site once per run,
normalizing each question with an entity-decoded title, its tag list as the
snippet, its creation date as `published_at`, and `score`/`answer_count` as the
engagement signals. The adapter SHALL function without `STACKEXCHANGE_KEY` and
SHALL send the key when configured. An API-level error response SHALL be
treated as an adapter failure.

#### Scenario: Hot questions normalized
- **WHEN** the adapter fetches a question with `score: 18`, `answer_count: 4`, and title `"Why doesn&#39;t useEffect fire?"`
- **THEN** the emitted item has `source: "stackoverflow"`, `raw_points: 18`, `raw_comments: 4`, and title `Why doesn't useEffect fire?`

#### Scenario: Keyless operation
- **WHEN** `STACKEXCHANGE_KEY` is unset
- **THEN** the request is made without a key parameter and the adapter functions normally

#### Scenario: API error response
- **WHEN** the API returns an error body (`error_id`/`error_message`)
- **THEN** the adapter throws with that message and the run history records it
```

### Tasks

```markdown
## 1. Config
- [ ] 1.1 `envSchema`: `STACKEXCHANGE_KEY: z.string().optional()`; export as `news_ingestion.stackexchange_key`; document in `.env.example` (optional quota raise, where to obtain)

## 2. Adapter
- [ ] 2.1 `adapters/stackoverflow.ts`: build URL (append `&key=` only when set); throw on non-OK or missing `items` (surface `error_message`); log a warning when the response carries `backoff`
- [ ] 2.2 Map per design (decodeEntities on title; `String(question_id)`; epoch-seconds ×1000 for `published_at`; tags joined as snippet)
- [ ] 2.3 Register `{ source: 'stackoverflow', fetch: fetchStackOverflow }` in `adapters/index.ts`

## 3. Tests
- [ ] 3.1 `newsIngestion.stackoverflow.test.ts`: entity decoding; keyless vs keyed URL; epoch date mapping; error-body throws; backoff logged not slept

## 4. Verification
- [ ] 4.1 `npm test && npm run build`; clean boot without the key
- [ ] 4.2 Manual ingest → `stackoverflow` fetched ≈ 25 in run history; older hot questions visible as `fresh_dropped` (expected, not a bug)
```

**Pitfalls:** design 3 — do not "fix" the freshness drops by faking `published_at`; quota is per-IP shared with anything else on the host — if verification shows `quota_remaining` unexpectedly low, get a key rather than raising pagesize.

---

## Change 7 — `google-news-adapter`

**Catalog:** Part B Tier 2, row 1. **Effort:** ~1 day. **Riskiest change in this plan — ship last, treat as expendable.**

### Why this is last

Google News RSS item links are `news.google.com` redirect URLs, not article URLs. Storing them would (a) break hash dedup against the same article from any other source and (b) fill the feed with redirect links. Canonicalization is solvable but relies on unofficial behavior (the catalog's "unofficial-but-stable" caveat) — so this change is engineered to degrade to zero items *visibly* (run-history error) rather than pollute the dataset, and the plan treats it as droppable if verification fails.

### Proposal input

**Why:** Every other source is community- or publisher-scoped. Google News RSS queries are the only free programmable per-topic firehose ("AI regulation", "React", …) covering the entire mainstream press, which the catalog recommends as one query per topic of interest.

**What changes:**
- New adapter `google_news`, disabled by default: new env var `NEWS_INGESTION_GOOGLE_NEWS_QUERIES` (comma-separated topics, default empty → adapter reports 'not configured').
- Per query: fetch `https://news.google.com/rss/search?q=<encoded topic>+when:1d&hl=en-US&gl=US&ceid=US:en`, parse with `rss-parser` (`parseString` on a fetched body, matching the timeout discipline), take the first 10 items.
- **Canonicalization requirement:** for each item, resolve the Google redirect to the publisher URL by following redirects (`fetch(link, { redirect: 'follow' })`, 5 s timeout) and using `response.url` when its hostname is not `news.google.com`. Items that cannot be canonicalized are **dropped and counted in a log line** — a `news.google.com` URL must never be stored.
- `source: 'google_news'` flat (queries are config, not identity); title's trailing ` - <Publisher>` suffix stripped; `published_at` from `pubDate`; no engagement (`raw_points: 0`).
- Cap: ≤ 3 queries, 10 items each → ≤ 30 canonicalization fetches per run, sequential-per-query with `Promise.allSettled` across queries.

**Capabilities:** MODIFIED `news-ingestion` (ADDED requirement).

**Impact:** new `adapters/googleNews.ts` + registry entry; `config/index.ts` + `.env.example` for the queries var; test `newsIngestion.googleNews.test.ts`.

### Design decisions

1. **Default-off.** Unlike Mastodon, this source has real failure modes (redirect behavior may change) and per-item fetch cost; the operator opts in per topic. Empty default satisfies boot-without-env automatically.
2. **Canonical URL is mandatory, drop otherwise.** The alternative — storing the Google URL — silently corrupts cross-source dedup (hash is URL-based) and is exactly the class of invisible data-quality failure this pipeline program exists to end. Semantic dedup remains a partial backstop for dropped duplicates.
3. **No base64/protobuf decoding** of the `CBM…` article ids: it's a reverse-engineered format that breaks without notice. Redirect-following is the only resolution mechanism; if Google fully drops redirect behavior, the adapter degrades to 0 canonicalized items and (having errored per-item) surfaces via zero-streak — the correct failure mode.
4. **Query volume:** enforce the ≤ 3 query cap in code (slice + warn), not just docs — an operator pasting 20 topics must not create 200 canonicalization fetches per run.
5. **Publisher-suffix strip:** Google appends ` - <Publisher Name>` to titles; strip the final ` - …` segment only when what remains is non-empty (defensive against titles containing hyphens).

### Spec delta (capability `news-ingestion`)

```markdown
## ADDED Requirements

### Requirement: Google News Query Source With Mandatory URL Canonicalization
The pipeline SHALL include a `google_news` adapter driven by
`NEWS_INGESTION_GOOGLE_NEWS_QUERIES` (comma-separated topics, at most 3 used per
run, default empty = unconfigured). For each topic it SHALL fetch the Google
News RSS search feed scoped to the last day and SHALL resolve every item link
to the publisher's canonical URL by following redirects; items whose canonical
URL cannot be resolved (or still resides on news.google.com) SHALL be dropped,
never stored. Emitted items carry the publisher URL, a title with Google's
publisher suffix removed, and the feed publication date.

#### Scenario: Redirect resolved to publisher URL
- **WHEN** a feed item's link redirects to `https://www.example-news.com/article`
- **THEN** the emitted item's `url` is the example-news.com URL and its hash dedupes against the same article arriving from any other source

#### Scenario: Unresolvable link is dropped
- **WHEN** following an item's link does not yield a non-Google hostname within the timeout
- **THEN** the item is dropped and the drop is logged with the query it came from

#### Scenario: Query cap enforced
- **WHEN** five topics are configured
- **THEN** only the first three are queried and a warning is logged

#### Scenario: Unconfigured by default
- **WHEN** `NEWS_INGESTION_GOOGLE_NEWS_QUERIES` is unset or empty
- **THEN** the adapter makes no network calls and the run history shows a "not configured" reason for `google_news`
```

### Tasks

```markdown
## 1. Config
- [ ] 1.1 `envSchema`: `NEWS_INGESTION_GOOGLE_NEWS_QUERIES: z.string().optional()`; export parsed array `news_ingestion.google_news_queries`; document in `.env.example` (off by default, ≤3 topics, canonicalization behavior, unofficial-endpoint caveat)

## 2. Adapter
- [ ] 2.1 `adapters/googleNews.ts`: unconfigured guard; slice queries to 3 with warning; per-query fetch + `parser.parseString`, first 10 items, per-query catch (allSettled pattern)
- [ ] 2.2 `canonicalize(link)`: `fetch(link, { redirect: 'follow' })` with 5 s AbortController; return `response.url` iff hostname ≠ news.google.com, else null; caller drops null with a counted log line
- [ ] 2.3 Map fields (publisher-suffix strip per design 5; `pubDate → published_at`; zero engagement); register `{ source: 'google_news', fetch: fetchGoogleNews }`

## 3. Tests
- [ ] 3.1 `newsIngestion.googleNews.test.ts`: canonical URL used for the item; null-canonical dropped; query cap slices at 3; unconfigured → no fetch; one query failing keeps others' items

## 4. Verification
- [ ] 4.1 `npm test && npm run build`; clean boot with the var unset
- [ ] 4.2 Configure 1 test query, manual ingest → run history `google_news` fetched ≤ 10; every stored google_news item's URL hostname is NOT news.google.com (Mongo spot-check — this is the gate)
- [ ] 4.3 If 4.2 shows 0 canonicalized items across 3 runs (redirects no longer followed): file the result and archive the change as rejected rather than shipping a lowered bar
```

**Pitfalls:** verification 4.2's hostname check is non-negotiable; do not add the base64-decode fallback "while you're in there" (design 3); canonicalization fetches count against politeness — never raise the per-query cap above 10 without revisiting.

---

## Deferred (explicitly not proposed now) & excluded

- **Bluesky** (catalog Tier 2): `app.bsky.feed.searchPosts?q=<topic>&sort=top` is public/no-auth, but turning posts into *news items* requires extracting external-link facets from post embeds and filtering out linkless chatter — a different item-construction model from every adapter above. Defer until Tier-1 sources have a week of run history proving remaining coverage gaps. When proposed, map `likeCount → raw_points`, `replyCount → raw_comments`, embed post text + linked-page title.
- **Everything on the catalog's excluded list stays excluded** (Twitter/X pricing/ToS, daily.dev no API, Medium clap scraping, LinkedIn, headless-browser scraping). Restate this in each proposal's out-of-scope section if pressure arises.

---

## Execution order & dependency summary

```
Change 1  lobsters-adapter          ── ship first (also creates htmlText.ts used by 2 & 6)
Change 2  hn-algolia-migration      ── after 1 (htmlText); watch the hash-compat smoke alarm
Change 3  mastodon-trending-adapter ── independent; parallelizable with 2
Change 4  rss-fleet-expansion       ── independent; config-mostly, any time
Change 5  product-hunt-adapter      ── needs one-time app registration; independent
Change 6  stackoverflow-hot-adapter ── after 1 (htmlText); independent otherwise
Change 7  google-news-adapter       ── last; expendable if canonicalization fails verification
```

Hard code dependencies: only `htmlText.ts` (Change 1 → 2, 6). Everything else is independent; apply on separate branches if parallelized, one `/opsx:propose` at a time.

## Definition of done (maps to master doc §5 + catalog acceptance checklist)

- [ ] Run history over 24 h shows non-zero `fetched` for: `lobsters`, `mastodon`, `stackoverflow`, the expanded `rss:<host>` labels (incl. `rss:github.com`, `rss:export.arxiv.org`), and `hackernews` at ≤ 2 requests/run — plus `producthunt` once credentials are registered
- [ ] First post-migration HN run shows high `hash_deduped` (hash compatibility proven, no backlog re-ingest)
- [ ] Server boots with **zero** new env vars set; every new var documented in `backend/.env.example`
- [ ] Credential-gated sources (`producthunt`, optional `google_news`) show honest "not configured" reasons in run history when unset — never silent empty successes
- [ ] No stored item has a `news.google.com` URL
- [ ] Total per-run fetched volume stays < ~400 items and the RSS feed list ≤ 25 feeds (cost guardrails)
- [ ] All new adapters have unit tests; `cd backend && npm test && npm run build` green after every change
