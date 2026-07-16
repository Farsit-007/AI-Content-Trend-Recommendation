## 1. Shared HTML-text helper

- [x] 1.1 Create `adapters/htmlText.ts` exporting `decodeEntities(text: string): string` and `stripHtml(html: string): string` (implementations lifted verbatim from `githubTrending.ts:18-25` and `:45`)
- [x] 1.2 Refactor `githubTrending.ts` to import them; run existing `newsIngestion.githubTrending.test.ts` to confirm zero behavior change

## 2. Adapter

- [x] 2.1 Create `adapters/lobsters.ts`: `fetchLobsters()` GETs `https://lobste.rs/hottest.json` with a `GrowthStudioBot/1.0`-style User-Agent; throw on non-OK
- [x] 2.2 Map fields per design decision 2 (incl. `url || comments_url` fallback and 500-char snippet cap); append tags to snippet when description is empty
- [x] 2.3 Register `{ source: 'lobsters', fetch: fetchLobsters }` in `adapters/index.ts`

## 3. Tests

- [x] 3.1 `newsIngestion.lobsters.test.ts` (mock `global.fetch`, copy devto test style): engagement mapping; text-post URL fallback; HTML description stripped; non-OK response throws

## 4. Verification

- [x] 4.1 `cd backend && npm test && npm run build`
- [x] 4.2 `POST /api/v1/news-items/ingest` (admin JWT) → run summary shows `lobsters` with `fetched ≈ 25`
- [x] 4.3 `GET /api/v1/news-items/ingestion-runs` → the run's `sources` contains a `lobsters` row with balanced layer counts
- [x] 4.4 Spot-check one stored item: `source: 'lobsters'`, `published_at` set, engagement present — verified after fixing a pre-existing, unrelated bug in `backend/src/app/lib/embeddings.ts` (see note below)

**Unplanned fix (out of scope of this change's spec, done to unblock 4.4):** the pipeline's embedding layer (`newsIngestion.service.ts`) fired one concurrent `embed()` call per unique item via `Promise.all`, and separately had no cap on input length. Two independent pre-existing bugs surfaced under this: (1) unbounded concurrency caused OpenRouter to intermittently return malformed responses, and (2) `adapters/rss.ts`'s unbounded `item.contentSnippet` could exceed the embedding model's 8192-token input limit and 400 the whole batch. Fixed by adding `embedBatch`/`embedItems` (batched, sequential, mirrors `categorizeBatch`'s batch-of-N convention) and a defensive `MAX_INPUT_CHARS` truncation in `backend/src/app/lib/embeddings.ts`. Confirmed end-to-end: `POST /ingest` completed with `total_stored: 220`, `lobsters: fetched 25, stored 22`, and a stored lobsters item verified with real engagement and `published_at`.
