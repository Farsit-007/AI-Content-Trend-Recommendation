# 4 — Full Content Storage & Extraction: OpenSpec Execution Plan

**Problem (V4 in the vision):** "While we are storing the resources, we also want to store the description and all the parts of the content of that resource in our db." Today every adapter stores only a short `snippet` (Stack Overflow stores a *tag list*, Product Hunt a *tagline*, Reddit truncates at 500 chars, RSS ignores the full `content:encoded` body it already receives). No adapter or pipeline layer ever fetches the linked page. Generation, categorization, and chat are all grounded on these thin snippets.
**Parent analysis:** [VISION-ALIGNMENT-DEEP-ANALYSIS.md](./VISION-ALIGNMENT-DEEP-ANALYSIS.md) §4.4 (gap), §6 Phase A (design).
**Sibling plans:** [2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md](./2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md) and [3-FARSIT-NEWS-DEDUP-UPDATES-OPENSPEC-PLAN.md](./3-FARSIT-NEWS-DEDUP-UPDATES-OPENSPEC-PLAN.md) touch the same pipeline file but different layers (engagement/lifecycle vs. content); no shared fields, safe to run in either order. [7-VISION-GENERATION-LONGFORM-OPENSPEC-PLAN.md](./7-VISION-GENERATION-LONGFORM-OPENSPEC-PLAN.md) Change 7B **depends on this plan** (facts-then-write consumes `content`).
**Date:** 2026-07-17

> **Execution protocol (one change at a time):**
> `/opsx:propose` (feed it the change's Proposal input + Design decisions + Spec delta + Tasks) → `/opsx:apply` → run the change's Verification → `/opsx:archive`. Never start the next change with the previous one unarchived.

---

## Global sequence (all vision plans, files 4-8)

| Seq | Change id | Plan file | Depends on |
|---|---|---|---|
| **4A** | `news-full-content-sources` | this file | — |
| **4B** | `news-content-extraction` | this file | 4A |
| 5A | `team-category-subscriptions` | file 5 | — |
| 6A | `style-packs-foundation` | file 6 | — |
| 6B | `style-packs-generation` | file 6 | 6A |
| 7A | `generation-longform-formats` | file 7 | — (6B recommended first) |
| 7B | `generation-facts-then-write` | file 7 | 4B, 7A |
| 7C | `generation-refine-and-drafts` | file 7 | 7A |
| 8A | `frontend-feed-page` | file 8 | none hard; better after 4A/4B/5A |
| 8B | `frontend-generate-editor` | file 8 | 7A/7C for full power |
| 8C | `frontend-team-settings` | file 8 | 5A, 6A |

Parallel tracks (3 devs): **Track 1** 4A→4B→7B · **Track 2** 6A→6B→7A→7C · **Track 3** 8A→8B→8C (frontend starts against today's APIs) · **Track 4 (anytime)** the already-written retention plan (file 2) then dedup-updates plan (file 3) — execute those two exactly as written in their own files; nothing here duplicates them.

---

## 0. Verified baseline (all facts re-checked in code on 2026-07-17)

| Fact | Location |
|---|---|
| `INewsItem` has `snippet?: string` and **no content field of any kind** | `backend/src/app/modules/NewsItem/newsItem.interface.ts:7` |
| `newsItemSchema` — same; only index is unique `content_hash`; no `timestamps` option (field is `created_at`) | `newsItem.model.ts:10,7,33` |
| `RawNewsItem` (adapter output) has `snippet?: string`, no content | `NewsIngestion/newsIngestion.interface.ts:6` |
| Per-adapter snippet assignments: gnews `article.description` (`gnews.ts:38`); reddit `post.selftext?.slice(0, 500)` (`reddit.ts:78`); devto `article.description` (`devto.ts:46`); producthunt `node.tagline` (`producthunt.ts:96`) — GraphQL `QUERY` requests `id name tagline url votesCount commentsCount createdAt`, **no `description`** (`producthunt.ts:14-22`); stackoverflow `question.tags.join(', ')` (`stackoverflow.ts:47`) — `BASE_URL` has **no `filter=` param**, so no question body is returned (`stackoverflow.ts:6`); hackernews `stripHtml(hit.story_text)` (`hackerNews.ts:54`); github `repo.description` (`githubTrending.ts:111`); rss `item.contentSnippet` (`rss.ts:33`) — parser constructed with `new Parser({ timeout: 10_000 })`, **no `customFields`**, so `content:encoded` is never read (`rss.ts:10`); lobsters `buildSnippet` = description capped at 500 or tag join (`lobsters.ts:5,20-29`); mastodon `stripHtml(link.description)` (`mastodon.ts:47`) | listed per file |
| Embedding text is `` `${item.title} ${item.snippet ?? ''}` `` — **must not change** (semantic-dedup threshold 0.88 was calibrated against it) | `newsIngestion.utils.ts:56` |
| Categorization prompt line per item: `` `${id}. "${title}" — ${snippet ?? 'no snippet'} (relevance_score=…, trend_score=…)` `` | `newsIngestion.categorize.ts:41-46` |
| Pipeline stored payload assembled at one place; `insertMany(payloads, { ordered: false })` | `newsIngestion.service.ts:223-245, 247-259` |
| Pipeline layer order: adapters → hash/freshness dedup → embed → semantic dedup → relevance filter (`relevant`) → `categorizeBatch` → store. The correct enrichment insertion point is **after `relevant` is computed (line 209-213), before `categorizeBatch(relevant)` (line 216)** — only items that will actually be stored get fetched | `newsIngestion.service.ts:200-216` |
| `IngestionRun` per-source counts type `ISourceRunCount` (fetched / fresh_dropped / hash_deduped / semantic_deduped / relevance_dropped / stored / error) — additive optional fields are safe; Admin UI maps only `fetched`→`stored` chips, tolerant of extra fields | `IngestionRun/ingestionRun.interface.ts`, `frontend/src/pages/dashboard/Admin.tsx:15-31` |
| `GET /news-items` list + `GET /news-items/:id` return `item.toObject()` spreads — **the full document including the 1536-float `embedding` already ships to clients**; adding a 20k-char `content` would bloat list responses unless projected out | `newsItem.service.ts:35-46, 54-99` |
| `getAllNewsItems` computes `high_opportunity` from `plain.embedding` **after** `toObject()` — any response-side stripping must happen after that computation | `newsItem.service.ts:77-85` |
| `GET /news-items` route has **no validation middleware wired** (`getAllNewsItemsValidation` exists but is not attached); create/update validations exist and must gain the new fields | `newsItem.route.ts:37`, `newsItem.validation.ts:9-49` |
| Admin manual create embeds `title + snippet` when no embedding supplied | `newsItem.service.ts:48-52` |
| Chat retrieval context block includes `snippet` only | `Chat/chat.retrieval.ts:42-52` |
| OpenAPI doc schemas for NewsItem live in `docs/schemas.ts` (properties list includes `processed`, `snippet`, …) | `backend/src/app/docs/schemas.ts:47,89` |
| Env config pattern: zod schema in `config/index.ts` with string defaults, exported under `config.news_ingestion.*` | `config/index.ts:70-99, 212-250` |
| Adapter test files exist per source (`newsIngestion.<source>.test.ts` ×10) using mocked `fetch`/fixtures | `backend/src/__tests__/` |
| `stripHtml` / `decodeEntities` helpers shared by adapters | `NewsIngestion/adapters/htmlText.ts` |
| Reddit is credential-gated (no-ops without `REDDIT_CLIENT_ID/SECRET`); Product Hunt likewise | `config/index.ts:78-90` |

**Non-goals for this whole plan (state them in both proposals):** embedding input stays `title + snippet` unchanged; no change to hash identity (`source:url`); no change to dedup thresholds; no live page fetch at *generation* time (ingestion-time only); no backfill of existing rows (the 72 h window rolls the corpus over naturally).

---

## Change 4A — `news-full-content-sources`

### Problem
Half the sources already *have* fuller text in the API responses the adapters make today (or one request-parameter away) and throw it on the floor. Capture everything that costs **zero extra HTTP requests** first, and give the data model a place to put it.

### Proposal input (for `/opsx:propose`)
> Add full-content storage to the news pipeline, phase 1 of 2: schema + free source upgrades. `NewsItem` gains `content` (extracted/plain full text, capped), `content_status` (`none|partial|full|failed`), `content_fetched_at`, `word_count`. `RawNewsItem` gains `content?: string` so adapters can supply it. Upgrade the six sources whose existing responses already carry fuller text at no extra request cost: Reddit (full `selftext`, keep 500-char snippet), Stack Overflow (add `filter=withbody` to the existing hot-questions call; strip HTML body → content; tags stay the snippet), Product Hunt (add `description` to the existing GraphQL query → content; tagline stays the snippet), Lobsters (uncapped description → content; capped snippet unchanged), RSS (register `content:encoded` via rss-parser `customFields`, strip HTML → content; `contentSnippet` stays the snippet), Hacker News (full stripped `story_text` → content for text posts). The pipeline payload maps content through with status + word count; caps applied centrally via a new `NEWS_CONTENT_MAX_CHARS` env (default 20000). List API responses exclude `content` (and drop the raw `embedding` vector after `high_opportunity` is computed); the single-item endpoint returns `content` but also drops `embedding`. Embedding input text and content-hash identity are explicitly unchanged. Mastodon/dev.to/GitHub/GNews link-only content arrives in change 2 (`news-content-extraction`).

### Design decisions
1. **`content_status` semantics (fixed vocabulary, used by generation later):** `none` = nothing beyond snippet (default); `full` = believed-complete text stored; `partial` = text stored but truncated by the char cap; `failed` = an enrichment attempt errored (only set by change 4B). Stored even when `content` is absent so downstream code never infers from string-emptiness.
2. **Cap centrally, not per adapter.** Adapters emit whatever they have; the pipeline payload assembly (`newsIngestion.service.ts:223-245`) applies `NEWS_CONTENT_MAX_CHARS` (default 20000), sets `partial` vs `full`, and computes `word_count` (whitespace split). One clamp site = no drift between ten adapters.
3. **Snippets are frozen.** Every adapter keeps emitting the exact same `snippet` as today — snippet feeds the embedding text (`newsIngestion.utils.ts:56`) and changing it would shift vectors under the calibrated 0.88 semantic-dedup threshold. `content` is purely additive.
4. **rss-parser gets explicit `customFields`:** `new Parser({ timeout: 10_000, customFields: { item: [['content:encoded', 'contentEncoded']] } })` — do not rely on implicit namespaced-key passthrough. `contentEncoded` → `stripHtml` + `decodeEntities` → content. Feeds without it (most GitHub release feeds carry full bodies; TechCrunch/Verge summaries don't) simply yield no content here — change 4B's page extraction covers them.
5. **Stack Overflow uses the documented built-in filter** `&filter=withbody` appended to the existing single list request; `question.body` (HTML) → strip → content. The response shape interface gains `body?: string`. Backoff/error handling unchanged.
6. **Product Hunt GraphQL adds one field** (`description`) to the node selection — same single request, same auth flow, same retry logic.
7. **API payload hygiene (contract change, no current consumer breaks):** list endpoint (`getAllNewsItems`) strips `content` **and** `embedding` from each returned object *after* `high_opportunity` is computed; `getSingleNewsItem` returns `content` but strips `embedding`. The Feed UI (plan 8A) is speced against this shape. Chat/report/generation read models directly via mongoose, not this API — unaffected.
8. **Admin create/update validation** gains `content` (string, max `NEWS_CONTENT_MAX_CHARS`), `content_status` (enum, default `none`), `word_count` (number int ≥0) — optional everywhere; manual-create embedding input stays `title + snippet`.
9. **No migration/backfill.** Old rows read as `content_status: 'none'` via schema default at read time; the 72 h ingestion window refreshes the working set within 3 days.

### Spec delta (capability `news-ingestion`)

## ADDED Requirements

### Requirement: Full Content Captured From Source APIs
The ingestion pipeline SHALL store, for each news item, the fullest text its source API already provides, in a `content` field separate from the short `snippet`, together with `content_status` (`none|partial|full|failed`), `word_count`, and `content_fetched_at`. Content SHALL be plain text (HTML stripped), capped at a configurable maximum (`NEWS_CONTENT_MAX_CHARS`, default 20000) applied at one central point in the pipeline, with `content_status` distinguishing capped (`partial`) from complete (`full`) text. The `snippet` field and the embedding input text SHALL remain byte-identical to their pre-change behavior for every source.

#### Scenario: Reddit self-post stores full text
- **WHEN** a Reddit text post with a 3000-character `selftext` is ingested
- **THEN** `snippet` is the first 500 characters (unchanged) and `content` holds the full 3000 characters with `content_status: 'full'` and a positive `word_count`

#### Scenario: Stack Overflow question body captured
- **WHEN** the Stack Overflow adapter fetches hot questions
- **THEN** the request includes `filter=withbody` and each stored item's `content` is the HTML-stripped question body while `snippet` remains the tag list

#### Scenario: RSS content:encoded captured
- **WHEN** an RSS feed item carries a `content:encoded` body
- **THEN** the stored item's `content` is the stripped text of that body and `snippet` remains rss-parser's `contentSnippet`

#### Scenario: Oversized content is capped and marked partial
- **WHEN** a source provides text longer than `NEWS_CONTENT_MAX_CHARS`
- **THEN** `content` is truncated to the cap and `content_status` is `'partial'`

#### Scenario: Sources without extra text are unchanged
- **WHEN** an item from a source that provides no fuller text (e.g. Mastodon) is ingested
- **THEN** the item stores `content_status: 'none'`, no `content`, and its snippet/embedding behavior is identical to before this change

### Requirement: News API Response Payload Hygiene
The news list endpoint SHALL NOT include `content` or the raw `embedding` vector in its per-item response objects (`high_opportunity` continues to be computed server-side before stripping). The single-item endpoint SHALL include `content` and content metadata but SHALL NOT include `embedding`.

#### Scenario: List response excludes heavy fields
- **WHEN** `GET /news-items` returns items
- **THEN** no returned object contains an `embedding` or `content` key, while `content_status` and `word_count` are present

#### Scenario: Detail response includes content
- **WHEN** `GET /news-items/:id` returns an item that has stored content
- **THEN** the response contains `content` and `content_status` but no `embedding` key

### Tasks
1. **Schema & types**
   - [ ] 1.1 `newsItem.interface.ts`: add `content?: string`, `content_status: 'none' | 'partial' | 'full' | 'failed'`, `content_fetched_at?: Date`, `word_count?: number` to `INewsItem`
   - [ ] 1.2 `newsItem.model.ts`: add the four fields (`content_status` `{ type: String, enum: [...], default: 'none' }`)
   - [ ] 1.3 `newsIngestion.interface.ts`: add `content?: string` to `RawNewsItem`
   - [ ] 1.4 `config/index.ts`: add `NEWS_CONTENT_MAX_CHARS` (zod string default `'20000'`) → `config.news_ingestion.content_max_chars: Number(...)`
2. **Adapter upgrades (snippet untouched in every one)**
   - [ ] 2.1 `reddit.ts`: emit `content: post.selftext || undefined` alongside the existing sliced snippet
   - [ ] 2.2 `stackoverflow.ts`: append `&filter=withbody` to `BASE_URL`; add `body?: string` to the response interface; emit `content: question.body ? decodeEntities(stripHtml(question.body)) : undefined`
   - [ ] 2.3 `producthunt.ts`: add `description` to the GraphQL node selection + `ProductHuntNode` interface; emit `content: node.description || undefined`
   - [ ] 2.4 `lobsters.ts`: emit `content` = full `decodeEntities(stripHtml(story.description))` when description exists (no 500 cap); `buildSnippet` unchanged
   - [ ] 2.5 `rss.ts`: construct parser with `customFields: { item: [['content:encoded', 'contentEncoded']] }`; emit `content: item.contentEncoded ? stripHtml(item.contentEncoded) : undefined` (type the custom field via the parser's generic or a local interface)
   - [ ] 2.6 `hackerNews.ts`: emit `content: hit.story_text ? stripHtml(hit.story_text) : undefined`
3. **Pipeline mapping**
   - [ ] 3.1 `newsIngestion.service.ts` payload assembly: new local helper `withContentMeta(item)` → `{ content, content_status, word_count, content_fetched_at }` applying the cap (`partial` when truncated, `full` when present under cap, `none` when absent) and `content_fetched_at: new Date()` when content present; spread into `payloads`
4. **API hygiene & validation**
   - [ ] 4.1 `newsItem.service.ts`: in `getAllNewsItems`'s `annotate` path, delete `embedding` and `content` from the plain object after `high_opportunity` is computed; in `getSingleNewsItem`, delete `embedding` from the returned plain object
   - [ ] 4.2 `newsItem.validation.ts`: add `content`/`content_status`/`word_count` (all optional) to create + update validations
   - [ ] 4.3 `docs/schemas.ts`: add the four fields to the NewsItem schema properties
5. **Tests** (extend the existing per-adapter test files; mock `fetch` fixtures)
   - [ ] 5.1 reddit: long selftext → full `content`, 500-char snippet
   - [ ] 5.2 stackoverflow: request URL contains `filter=withbody`; body HTML stripped into content; snippet still tags
   - [ ] 5.3 producthunt: GraphQL query string contains `description`; node description mapped
   - [ ] 5.4 rss: fixture feed with `content:encoded` → content set; feed without it → content undefined
   - [ ] 5.5 lobsters/hackerNews: content mapped, snippet byte-identical to prior expectation
   - [ ] 5.6 pipeline unit (`newsIngestion.summary.test.ts` or new): oversized content → capped + `partial`; absent → `none`
   - [ ] 5.7 `newsItem.integration.test.ts`: list response has no `embedding`/`content` keys; detail response has `content`, no `embedding`
6. - [ ] 6.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live: `docker restart growth-studio-backend` (bind-mount picks up code) → `POST /news-items/ingest` as admin → inspect 3 stored items from reddit/stackoverflow/rss (`GET /news-items/:id`): `content` present with sane text, `content_status` correct, list endpoint responses visibly smaller (no embedding).
- Confirm one pre-existing item (ingested before the change) still lists fine and reads as `content_status: 'none'`.

---

## Change 4B — `news-content-extraction`

### Problem
Link-only items (most HN links, Mastodon, GNews, summary-only RSS feeds, Lobsters links, dev.to, GitHub repos) still have no `content` after 4A. They need an enrichment layer that fetches full text — via per-source APIs where they exist (dev.to by-id, GitHub README) and readable-article extraction of the linked page otherwise — plus the downstream wiring that makes the new content useful (categorization + chat context) and observable (run counts).

### Proposal input (for `/opsx:propose`)
> Full-content phase 2 of 2: a content-enrichment layer in the ingestion pipeline. New `newsIngestion.contentFetch.ts` runs after relevance filtering and before categorization (so only to-be-stored items are fetched — typically 20-60/run), fills `content` for items that lack it: dev.to via `GET https://dev.to/api/articles/{source_id}` (`body_markdown`), github_trending via the repo README API (raw, capped), everything else via generic page extraction (own `fetch` with timeout/UA/content-type/size guards → `@extractus/article-extractor`'s `extractFromHtml` → stripped, whitespace-normalized text). Bounded concurrency (default 3), per-item soft-fail to `content_status: 'failed'` — enrichment never drops or blocks an item, and a feature flag (`NEWS_CONTENT_FETCH_ENABLED`, default true) can disable the whole layer. Categorization prompts gain the first 500 chars of content; chat retrieval context gains the first 300. `IngestionRun` per-source counts gain additive `content_fetched`/`content_failed`. Embeddings remain `title + snippet`.

### Design decisions
1. **Placement:** between the `relevant` computation (`newsIngestion.service.ts:209-213`) and `categorizeBatch(relevant)` (line 216). Rationale: (a) fetch only survivors — an order of magnitude fewer requests than fetching at adapter time; (b) categorization immediately benefits. Manual `POST /news-items/ingest` gets slower by ~1-3 min worst case — acceptable for an admin action; note it in the endpoint's docs description.
2. **Routing table inside `enrichContent`:** items already carrying `content` (from 4A) are skipped untouched; `source === 'devto'` → by-id API; `source === 'github_trending'` → README API (`GET https://api.github.com/repos/{source_id}/readme`, header `Accept: application/vnd.github.raw+json`, plus auth header when `config.news_ingestion.github_token` set — `source_id` is already `owner/repo`); everything else → generic extractor on `item.url`.
3. **Generic extractor discipline (each guard is a task):** `AbortController` timeout `NEWS_CONTENT_FETCH_TIMEOUT_MS` (default 10000); `User-Agent: GrowthStudioBot/1.0 (+news content enrichment)`; reject non-2xx; reject when `content-type` lacks `text/html`; read body then reject > 2 MB; `extractFromHtml(html, url)`; result HTML → `stripHtml` + `decodeEntities` → collapse `\s{2,}`/blank-line runs → cap via the 4A helper. Any failure → `content_status: 'failed'`, item continues.
4. **Dependency choice:** `@extractus/article-extractor` (MIT, actively maintained, Readability-based) used **only** for `extractFromHtml` — we always fetch ourselves so timeout/size policy stays ours. No jsdom (heavy) anywhere.
5. **Concurrency:** a small local `mapWithConcurrency(items, limit, fn)` helper (no new dep), limit `NEWS_CONTENT_FETCH_CONCURRENCY` default 3 — mirrors the pipeline's existing "don't flood free-tier/off-box services" stance (`newsIngestion.utils.ts:48-51` comment).
6. **Categorization widening:** the per-item prompt line appends `` — content: ${content.slice(0, 500)} `` only when content exists. Batch of 10 × ≤500 chars ≈ +1.3k tokens/batch — bounded. Fallback behavior and JSON contract unchanged.
7. **Chat widening:** `chat.retrieval.ts` projection adds `content`; the context block gains `Content: ${content.slice(0, 300)}` when present.
8. **Observability:** `ISourceRunCount` gains optional `content_fetched?: number` and `content_failed?: number`; `enrichContent` returns per-source tallies threaded into `persistRun`. Admin UI untouched (tolerant of extra fields) — surfacing them is optional UI polish later.
9. **The layer is fail-open at every level:** a thrown error inside the whole `enrichContent` call is caught in the pipeline, logged, and the run proceeds with unenriched items — content is enrichment, never gating (mirrors the categorize-fallback philosophy).

### Spec delta (capability `news-ingestion`)

## ADDED Requirements

### Requirement: Linked-Page Content Enrichment
For stored-bound news items that lack API-provided content, the pipeline SHALL attempt to obtain full text after relevance filtering and before categorization: dev.to items via the article-by-id API, GitHub Trending items via the repository README API, and all other items via readable-article extraction of the linked page, subject to a request timeout, an HTML content-type check, a response-size limit, and bounded concurrency. Extraction failure SHALL mark the item `content_status: 'failed'` without dropping, delaying beyond the bounded attempt, or otherwise altering the item. The enrichment layer SHALL be disableable via `NEWS_CONTENT_FETCH_ENABLED` and SHALL record per-source fetched/failed counts in the persisted ingestion run.

#### Scenario: HN link post gets article text
- **WHEN** a Hacker News link post pointing at an extractable article survives relevance filtering
- **THEN** the stored item's `content` holds the extracted plain article text with `content_status: 'full'` (or `'partial'` if capped)

#### Scenario: dev.to full body via API
- **WHEN** a dev.to item (which carries only a description snippet at fetch time) reaches enrichment
- **THEN** its `content` is the `body_markdown` of `GET /api/articles/{id}`, not a page scrape

#### Scenario: Paywalled or JS-only page fails soft
- **WHEN** the linked page times out, returns non-HTML, exceeds the size limit, or yields no extractable text
- **THEN** the item is stored anyway with `content_status: 'failed'` and the run continues

#### Scenario: Kill switch
- **WHEN** `NEWS_CONTENT_FETCH_ENABLED=false`
- **THEN** the pipeline stores items exactly as change 4A left them, with zero enrichment HTTP requests

#### Scenario: Run counts capture enrichment health
- **WHEN** an ingestion run performs enrichment
- **THEN** the persisted `IngestionRun` per-source counts include `content_fetched` and `content_failed`

## MODIFIED Requirements

### Requirement: Categorization Uses Available Content
The categorization prompt SHALL include, per item, the first 500 characters of stored `content` when present, in addition to the title and snippet, leaving the response contract, batching, and fallback behavior unchanged.

#### Scenario: Content lead in categorize prompt
- **WHEN** a batch containing an item with content is categorized
- **THEN** the user prompt line for that item contains its content lead, and items without content render exactly as before

### Tasks
1. **Config & dependency**
   - [ ] 1.1 `npm i @extractus/article-extractor` (backend)
   - [ ] 1.2 `config/index.ts`: `NEWS_CONTENT_FETCH_ENABLED` (default `'true'`), `NEWS_CONTENT_FETCH_TIMEOUT_MS` (default `'10000'`), `NEWS_CONTENT_FETCH_CONCURRENCY` (default `'3'`) → `config.news_ingestion.content_fetch.{enabled,timeout_ms,concurrency}`
2. **Enrichment module** — new `backend/src/app/modules/NewsIngestion/newsIngestion.contentFetch.ts`
   - [ ] 2.1 `mapWithConcurrency` helper (pure, exported for tests)
   - [ ] 2.2 `fetchDevToBody(source_id)` / `fetchGithubReadme(source_id)` (auth header when token present)
   - [ ] 2.3 `extractFromUrl(url)` with all §Design-3 guards, returning plain text or throwing typed reasons (timeout / non-html / too-large / http / empty-extract) for log clarity
   - [ ] 2.4 `enrichContent(items)` — skip-if-content routing per §Design-2; per-item try/catch → `'failed'`; returns `{ items, countsBySource: Record<string, { fetched: number; failed: number }> }`
3. **Pipeline wiring** (`newsIngestion.service.ts`)
   - [ ] 3.1 Call `enrichContent(relevant)` (guarded by the enable flag and a top-level try/catch that logs and falls through) between relevance filter and `categorizeBatch`; pass enriched items onward; apply the same 4A cap/status helper to newly fetched text
   - [ ] 3.2 Thread `content_fetched`/`content_failed` into `RunCountState` → `buildSourceRunCounts` → `ISourceRunCount` (optional fields) → `ingestionRun.model.ts` schema (Number, optional)
4. **Consumers**
   - [ ] 4.1 `newsIngestion.categorize.ts`: append content lead per §Design-6
   - [ ] 4.2 `chat.retrieval.ts`: add `content` to the projection + `Content:` line (≤300 chars) in `rankNewsItems`'s block
5. **Tests**
   - [ ] 5.1 New `newsIngestion.contentFetch.test.ts`: routing (devto→API, github→README, other→page); each guard (timeout via never-resolving fetch mock + fake timers or abort assertion, non-HTML content-type, >2MB, non-2xx, empty extraction) → `'failed'`; concurrency helper ordering; counts tally
   - [ ] 5.2 Fixture: `__tests__/fixtures/article.html` (realistic article markup) → extraction yields expected text
   - [ ] 5.3 Categorize test: prompt contains content lead when present, absent otherwise
   - [ ] 5.4 Pipeline-level: enrichment throwing entirely → run completes, items stored unenriched (mock `enrichContent` to throw)
   - [ ] 5.5 `chat` retrieval unit: context includes content lead
6. - [ ] 6.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live: trigger `POST /news-items/ingest`; watch logs for enrichment lines; verify (a) an HN **link** post now has `content` (`GET /news-items/:id`), (b) a paywalled item (e.g. Wired) shows `content_status: 'failed'` and still listed, (c) `GET /news-items/ingestion-runs` latest run rows include `content_fetched`/`content_failed`, (d) run duration stays acceptable (< ~4 min).
- Set `NEWS_CONTENT_FETCH_ENABLED=false`, restart, re-ingest → zero enrichment requests in logs.
- **Definition of done for the whole plan:** a Product Hunt item shows its full description, a Stack Overflow item its question body, an HN link post its article text — all visible via the API, all with correct statuses, with `npm test` green.
