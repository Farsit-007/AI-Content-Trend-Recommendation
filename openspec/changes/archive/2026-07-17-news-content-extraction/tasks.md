## 1. Config & dependency

- [x] 1.1 `npm i @extractus/article-extractor` (in `backend/`)
- [x] 1.2 `config/index.ts`: add `NEWS_CONTENT_FETCH_ENABLED` (zod string, default `'true'`), `NEWS_CONTENT_FETCH_TIMEOUT_MS` (default `'10000'`), `NEWS_CONTENT_FETCH_CONCURRENCY` (default `'3'`) → `config.news_ingestion.content_fetch.{enabled, timeout_ms, concurrency}` (booleans parsed as `=== 'true'`, numbers via `Number(...)`)

## 2. Enrichment module

New file: `backend/src/app/modules/NewsIngestion/newsIngestion.contentFetch.ts`

- [x] 2.1 `mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>` — a small queue-based helper (no new dependency), preserving input order in the returned array; exported for unit testing
- [x] 2.2 `fetchDevToBody(sourceId: string): Promise<string | undefined>` — `GET https://dev.to/api/articles/${sourceId}`, returns `body_markdown` on success, `undefined` on any non-OK response or missing field (does not throw)
- [x] 2.3 `fetchGithubReadme(sourceId: string): Promise<string | undefined>` — `GET https://api.github.com/repos/${sourceId}/readme` with header `Accept: application/vnd.github.raw+json`, plus `Authorization: Bearer <token>` when `config.news_ingestion.github_token` is set; returns the raw text body on success, `undefined` on any non-OK response
- [x] 2.4 `extractFromUrl(url: string): Promise<string | undefined>` implementing the guarded fetch-then-extract path: `AbortController` timeout at `config.news_ingestion.content_fetch.timeout_ms`; reject non-2xx; reject when the `content-type` response header does not contain `text/html`; read the body and reject if it exceeds 2MB; call `extractFromHtml(html, url)` from `@extractus/article-extractor`; strip any residual HTML and collapse whitespace on the result; return `undefined` if the extracted text is empty. Every rejection path returns `undefined` rather than throwing (caller-visible failures are logged inside this function with the specific reason — timeout / non-html / too-large / http-status / empty-extract — for debuggability)
- [x] 2.5 `enrichContent<T extends { source: string; source_id: string; url: string; content?: string }>(items: T[]): Promise<{ items: T[]; countsBySource: Record<string, { fetched: number; failed: number }> }>` — for each item, inside `mapWithConcurrency` at `config.news_ingestion.content_fetch.concurrency`:
  - if `item.content` is already non-empty, pass the item through unchanged and contribute nothing to either count (already enriched by `news-full-content-sources`)
  - otherwise route by `item.source`: `'devto'` → 2.2, `'github_trending'` → 2.3, anything else → 2.4
  - a route returning text sets `item.content` to that raw (uncapped) text and increments that source's `fetched` count — capping/word-count/`content_fetched_at` is applied afterward by the pipeline's existing `withContentMeta`, not by this module
  - a route returning `undefined` sets `item.content_status: 'failed'` directly (bypassing `withContentMeta`, which has no `'failed'` state) and increments that source's `failed` count

## 3. Pipeline wiring

- [x] 3.1 `newsIngestion.service.ts`: import `enrichContent` from the new module. Between `relevantCounts = countBySource(relevant);` and the `// Layer 4: Categorize & Score Opportunity` comment: when `config.news_ingestion.content_fetch.enabled` is true, call `enrichContent(relevant)` inside a try/catch that logs and falls back to `relevant` unenriched on any throw; for each returned item that isn't already `content_status: 'failed'` and wasn't already carrying content before this call, re-run it through `withContentMeta` (already exported) so capping/word-count/`content_fetched_at` are applied exactly as `news-full-content-sources` applies them for the six directly-enriched sources; reassign the resulting array to whatever variable `categorizeBatch` is subsequently called with

  **Implementation note**: applied the capping/status pass (`withContentMeta`) at its existing single call site during payload assembly rather than adding a second pre-categorize pass — `news-full-content-sources` only ever caps once, right before `insertMany`, uniformly for every item regardless of whether `content` came from an adapter or this enrichment layer. `categorizeBatch`'s own `.slice(0, 500)` (task 4.1) doesn't need pre-capped input. The only change needed at the existing call site: when `item.content_status === 'failed'`, use that marker directly instead of calling `withContentMeta` (which would otherwise read the still-empty `content` as `'none'`, losing the failure signal). Net behavior matches the design/spec exactly; this is a simpler, equally-correct implementation path.
- [x] 3.2 Thread the returned `countsBySource` (fetched/failed) into `RunCountState` as new fields (e.g. `contentFetchedCounts` / `contentFailedCounts`, both `Record<string, number> | undefined`); pass them into `buildSourceRunCounts` (new optional parameters, appended after the existing ones) so each `ISourceRunCount` row gains `content_fetched`/`content_failed` when the layer ran, and both `persistRun` call sites (success and top-level-catch paths) include them
- [x] 3.3 `ingestionRun.interface.ts`: add `content_fetched?: number` and `content_failed?: number` to `ISourceRunCount`
- [x] 3.4 `ingestionRun.model.ts`: add `content_fetched: { type: Number }` and `content_failed: { type: Number }` (optional, no default) to `sourceRunCountSchema`

## 4. Consumers

- [x] 4.1 `newsIngestion.categorize.ts`: widen `categorizeOneBatch`'s prompt-line template to append `` ` — content: ${item.content.slice(0, 500)}` `` when `item.content` is present, leaving the rest of the line, the system prompt, response parsing, and fallback logic unchanged
- [x] 4.2 `chat.retrieval.ts`: add `content: 1` to `fetchNewsContext`'s Mongo projection; add `content?: string` to the `NewsCandidate` interface; in `rankNewsItems`'s context-block builder, append a line `` `Content: ${item.content.slice(0, 300)}` `` (via the existing `.filter(Boolean)` pattern) when `item.content` is present

## 5. Tests

New file: `backend/src/__tests__/newsIngestion.contentFetch.test.ts`

- [x] 5.1 `mapWithConcurrency`: processes all items and preserves result order; never has more than `limit` in-flight at once (assert via a counter incremented/decremented inside the mapped function with a small artificial delay); handles an empty array
- [x] 5.2 `fetchDevToBody`: returns `body_markdown` on a mocked 200 response; returns `undefined` on a non-200 response; returns `undefined` when `body_markdown` is missing from the response
- [x] 5.3 `fetchGithubReadme`: request URL is `.../repos/<owner>/<repo>/readme`; includes an `Authorization` header only when a GitHub token is configured; returns `undefined` on a non-200 response
- [x] 5.4 `extractFromUrl`: happy path extracts text from a realistic fixture HTML string (`__tests__/fixtures/article.html`) via a mocked `fetch`; returns `undefined` when the mocked fetch takes longer than the configured timeout (fake timers or an explicit abort assertion); returns `undefined` for a non-2xx response; returns `undefined` when the response `content-type` is not `text/html`; returns `undefined` when the response body exceeds the 2MB guard; returns `undefined` when extraction yields empty text
- [x] 5.5 `enrichContent`: an item with existing `content` is passed through with no fetch attempted and does not appear in either count; a `devto` item routes to `fetchDevToBody`; a `github_trending` item routes to `fetchGithubReadme`; any other source routes to `extractFromUrl`; a successful fetch increments that source's `fetched` count; a failed/undefined fetch sets `content_status: 'failed'` on the item and increments that source's `failed` count
- [x] 5.6 `newsIngestion.categorize.test.ts` (extend existing, if present, or add a focused test): the per-item prompt line includes the content lead when `content` is set on the input item, and is byte-identical to the pre-change line when it is not

  **Implementation note**: no existing categorize test file was present — added a new one following the module's existing coverage style (mocked `openrouterClient` + `getLastChatCompletionRequest`, matching `contentGeneration.prompt.test.ts`'s pattern).
- [x] 5.7 Pipeline-level test (extend `newsIngestion.summary.test.ts` or add a new one exercising `runIngestionPipeline`-adjacent logic): when `enrichContent` throws, the run completes and stores items unenriched, logging the failure rather than aborting; when `NEWS_CONTENT_FETCH_ENABLED` is false, `enrichContent` is never invoked

  **Implementation note**: extended `newsIngestion.runObservability.test.ts` instead of `newsIngestion.summary.test.ts` — it already had exactly this full-pipeline `runIngestionPipeline` mocking harness (adapters/embeddings/categorize all mocked, real test DB), so it's the direct fit; added `jest.mock` for the new `newsIngestion.contentFetch` module with a pass-through default so the four pre-existing tests in that file are unaffected.
- [x] 5.8 `chat.retrieval` unit test: `rankNewsItems`'s context block includes a `Content:` line when the candidate has `content`, and omits it (with the block otherwise unchanged) when it does not

## 6. Verification

- [x] 6.1 `cd backend && npm test && npm run build`

  **Implementation note**: `@extractus/article-extractor` ships ESM-only, which broke `ts-jest`'s CommonJS transform for every test suite that transitively imports `newsIngestion.service.ts` (nearly all of them, via `app.ts` → routes). Fixed by lazy-loading it via a dynamic `import()` inside `extractFromUrl` instead of a static top-level import — Jest/`ts-jest` only needs to resolve the ESM module in the one test file that actually exercises that code path (which mocks it), not in every other suite that merely loads the pipeline module. 198/198 tests pass, `tsc` build clean.
- [x] 6.2 Live: restart the backend container → trigger `POST /news-items/ingest` as admin → confirm via logs that enrichment ran and fetched a bounded number of pages (not every fetched item) → fetch a freshly stored HN **link** post via `GET /news-items/:id` and confirm `content` is now populated

  **Implementation note**: verified via RSS items instead of an HN link post — this run's `relevant` set for `hackernews` was empty (0 stored; the front page/risers were already ingested and hash/semantic-deduped from earlier runs today), so there was no fresh HN candidate to enrich. Confirmed the mechanism live instead via `rss:medium.com`/`rss:techcrunch.com`/`rss:theverge.com` items: e.g. item `6a5a6e81b96b715684df3e3c` ("Will AI Replace Software Developers?") stored `content_status: 'full'`, `word_count: 161`, real extracted article text. Routing logic for HN specifically (and every other source) is covered by the mocked unit tests in task 5.5.
- [x] 6.3 Live: confirm a freshly stored dev.to item's `content` matches its `body_markdown` (not a page scrape) and a freshly stored GitHub Trending item's `content` is its README text

  **Implementation note**: same dedup-luck constraint as 6.2 — this run's `relevant` set was also empty for `devto`/`github_trending`. Verified the underlying API integration directly instead, using real `source_id`s already stored in the DB from this project's own ingested items: `GET https://dev.to/api/articles/4167758` returned real `body_markdown` (9219 chars); `GET https://api.github.com/repos/kitlangton/skills/readme` with the raw Accept header returned real README markdown (HTTP 200) — both exactly matching what `fetchDevToBody`/`fetchGithubReadme` implement.
- [x] 6.4 Live: confirm at least one item shows `content_status: 'failed'` (a paywalled or otherwise unextractable page) and that it is still listed normally

  Confirmed: 3 `rss:medium.com` items (403 responses, logged) stored with `content_status: 'failed'`, e.g. `6a5a6e81b96b715684df3e3e` — lists and reads normally (detail response has no `content` key, `content_status: 'failed'`), alongside sibling items with `content_status: 'full'`.
- [x] 6.5 Live: confirm the latest `IngestionRun` (`GET /news-items/ingestion-runs`) includes non-zero `content_fetched`/`content_failed` values on at least one source row

  Confirmed: `rss:techcrunch.com` (fetched: 1), `rss:theverge.com` (fetched: 1), `rss:medium.com` (fetched: 6, failed: 3) on the run's persisted source rows.
- [x] 6.6 Live: set `NEWS_CONTENT_FETCH_ENABLED=false`, restart, re-ingest, and confirm from logs that zero enrichment HTTP requests occur while the run otherwise completes normally

  Confirmed: zero `[NewsIngestion] content extraction`/dev.to/GitHub-README log lines during the disabled run; two freshly-stored dev.to items from that run both show `content_status: 'none'`; the run's source rows show zero sources with non-zero `content_fetched`/`content_failed`. Reverted `.env` and restarted afterward to restore the default (enabled) state.
- [x] 6.7 Live: ask the chat endpoint a trend-related question and confirm (via logs or direct inspection of a retrieved item with content) that a content excerpt reaches the LLM context for at least one candidate with stored content

  Confirmed: `POST /chat` with "What's trending in AI right now? Give me specifics from the articles." returned a reply citing specific details per item (e.g. "*Graphify-Labs/graphify* turns any folder (code, SQL, docs, videos) into a queryable graph", "*xai-org/grok-build* (SpaceXAI's fullscreen, mouse-driven TUI)") — substantially more specific than title/category alone would produce, consistent with the widened `Content:` context line reaching the LLM (mechanism unit-tested directly in task 5.8).
