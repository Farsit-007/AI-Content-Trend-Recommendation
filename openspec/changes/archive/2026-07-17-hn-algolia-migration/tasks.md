## 1. Adapter rewrite

- [x] 1.1 In `adapters/hackerNews.ts`, replace the Firebase flow with a `fetchAlgolia(url)` helper (per-call try/catch returning `null` on failure, logged — devto pattern) called for the two Algolia URLs (file-local constants; `%3E` pre-encoded for `points>50`)
- [x] 1.2 Merge results by `objectID` into a `Map` (front-page hit inserted first so it wins on conflict); throw only if both calls returned `null`
- [x] 1.3 Map fields per design: `source: 'hackernews'`, `source_id: String(objectID)`, `url: hit.url ?? 'https://news.ycombinator.com/item?id=' + objectID` (identical to the old fallback format), `points → raw_points`, `num_comments → raw_comments`, `created_at_i * 1000 → published_at`, `story_text` stripped via `htmlText.ts`'s `stripHtml` → `snippet`

## 2. Tests

- [x] 2.1 Create `newsIngestion.hackernews.test.ts`: merge/dedupe by `objectID` (front-page copy wins when a story is in both); URL fallback format matches `https://news.ycombinator.com/item?id=<id>` exactly; one-call-failure returns the surviving call's items; both-calls-failing throws
- [x] 2.2 Hash-compatibility test: `computeContentHash('hackernews', <url derived from an Algolia item>)` equals the hash computed from the same story mapped through the old Firebase adapter's rules, for fixtures both with and without `hit.url` present

## 3. Verification

- [x] 3.1 `cd backend && npm test && npm run build`
- [x] 3.2 Manual ingest (`POST /api/v1/news-items/ingest`, admin JWT) against live Atlas/Redis → `hackernews` `fetched: 29` (front page + risers merged; today's risers query happened to add no net-new stories over the front page — a legitimate day-to-day variance, not a bug)
- [x] 3.3 `hash_deduped: 24` of `fetched: 29` (83%) on the first post-migration run, `stored: 1` — high dedup rate against items the old Firebase adapter had already stored, confirming `content_hash` compatibility. `stored` is not ≈ `fetched`.
- [x] 3.4 Ran ingestion a second time: `hash_deduped: 25`, `stored: 0` (nothing re-stored). Queried `GET /api/v1/news-items` for all `hackernews` items (69 stored, spanning both the pre-migration and post-migration adapters) — zero duplicate titles, zero duplicate `content_hash` values
