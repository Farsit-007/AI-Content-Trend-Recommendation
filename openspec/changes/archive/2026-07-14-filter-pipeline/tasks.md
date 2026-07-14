## 1. Config

- [x] 1.1 Add `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` to `backend/src/config/index.ts` zod schema, default `0.88` (recalibrated from an initial `0.93` guess after live verification against real embeddings, see task 5.1)

## 2. Shared utilities

- [x] 2.1 Move `cosineSimilarity` from `newsIngestion.scoring.ts` into `newsIngestion.utils.ts` and export it
- [x] 2.2 Update `newsIngestion.scoring.ts` (`scoreRelevance`) to import `cosineSimilarity` from `newsIngestion.utils.ts`

## 3. Semantic dedup

- [x] 3.1 Add `fetchRecentEmbeddings(cutoff: Date): Promise<number[][]>` to `newsIngestion.utils.ts` (or scoring.ts), querying `NewsItem.find({ published_at: { $gte: cutoff } }, { embedding: 1 })`
- [x] 3.2 Add `dedupeSemanticaly(items: (HashedNewsItem & { embedding: number[] })[], recentPool: number[][], threshold: number)` that greedily walks items, tracking an accepted set, and applies the keep-higher-engagement tie-break against both the recent pool and previously-accepted in-run items
- [x] 3.3 Unit test: two in-run items above threshold → lower-engagement one discarded
- [x] 3.4 Unit test: item above threshold against recent-pool embedding → discarded regardless of engagement
- [x] 3.5 Unit test: items below threshold → both survive

## 4. Pipeline reorder

- [x] 4.1 In `runIngestionPipeline()` (`newsIngestion.service.ts`), move embedding generation (`embed(...)`) to run immediately after `dedupeAgainstStored`, before relevance/trend scoring
- [x] 4.2 Fetch the recently-stored embedding pool once per run using the same cutoff as `filterFresh`/`config.news_ingestion.max_age_hours`
- [x] 4.3 Run semantic dedup on the embedded `unique` set before computing `relevance_score`/`trend_score`
- [x] 4.4 Ensure semantically-deduped items are reflected in the existing per-source `discarded` count in `IngestionSummary`

## 5. Verification

- [x] 5.1 Run `POST /news-items/ingest` manually against seeded near-duplicate items (e.g. same article title/snippet from two mocked sources) and confirm only one survives — verified live via `npm run verify:semantic-dedup-live` (`backend/src/scripts/verifySemanticDedupLive.ts`) against the real DB and real OpenRouter embeddings: two paraphrased descriptions of the same story (0.8992 cosine similarity) collapsed to the higher-engagement one (Dev.to, 300 pts, kept over HN, 50 pts)
- [x] 5.2 Confirm distinct, unrelated items from the same run both survive (no over-merging) — same live run: an unrelated item (0.14 similarity) survived untouched alongside the deduped pair
- [x] 5.3 Confirm total LLM categorization batch calls reflect the deduped (smaller) item count, not the pre-dedup count — confirmed by code path: `newsIngestion.service.ts` builds `scored`/`relevant` (fed to `categorizeBatch`) from `deduped`, never from the pre-dedup `unique`/`embedded` arrays; also observed live via `POST /news-items/ingest` (Dev.to run: 30 fetched → 0 reaching the LLM step once hash-dedup/freshness/semantic-dedup had already reduced the set)
