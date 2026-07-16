## 1. Config

- [x] 1.1 Added `GITHUB_TOKEN: z.string().optional()` to `backend/src/app/config/index.ts` envSchema
- [x] 1.2 Exposed as `news_ingestion.github_token`
- [x] 1.3 Documented in `backend/.env.example`

## 2. Adapter — split and title enrichment

- [x] 2.1 `fetchTrendingScrape()` in `adapters/githubTrending.ts`: throws on non-OK HTTP, returns `[]` (not a throw) on 200-with-zero-parsed-blocks
- [x] 2.2 `enrichTitle(fullName, description?)` helper, truncating at 200 chars with an ellipsis; applied in `parseRepoBlock`'s title field
- [x] 2.3 `fetchRecentPopular()` querying the GitHub Search API with `created:>=<UTC date>` tracking `NEWS_INGESTION_MAX_AGE_HOURS`, optional bearer token, full `RawNewsItem` mapping including real `published_at`

## 3. Adapter — merge and soft-failure promotion

- [x] 3.1 `fetchGithubTrending` runs both paths via `Promise.allSettled`
- [x] 3.2 Merged into a `Map` keyed by `source_id`, first occurrence wins
- [x] 3.3 **Implementation refinement found while implementing this task.** The original wording ("throw... (or noting the zero-blocks-parsed case from the scrape)") was in tension with design.md's Decision 5, which explicitly reasoned *against* treating a scrape's zero-blocks-parsed outcome as a throw trigger on its own (to avoid false alarms when the Search API path is still delivering real items — see design.md's "Alternative considered: throw whenever the scrape alone yields zero... Rejected"). Implemented per the design decision: **only an actual rejection on at least one path** (not "path legitimately found zero") drives the throw when the merged result is empty. Corrected `specs/news-ingestion/spec.md`'s scenario wording to match (was ambiguous between "path errored" and "path found zero"; split into two explicit scenarios — "total failure" throws, "markup change alone while API delivers" does not).
- [x] 3.4 Non-empty merged result returns regardless of one path failing; that path's failure is `logger.error`'d, not promoted to a thrown error

## 4. Tests

- [x] 4.1 Unit test: both paths reject → throws — `newsIngestion.githubTrending.test.ts`
- [x] 4.2 Unit test: scrape zero-blocks + API succeeds → returns API items, no throw
- [x] 4.3 Unit test: scrape succeeds + API fails → returns scraped items, no throw
- [x] 4.4 Unit test: same repo in both paths → returned once (scrape entry wins, first-occurrence rule)
- [x] 4.5 Unit test: API item's `published_at` set from `created_at`; scraped item's stays `undefined`
- [x] 4.6 Unit test: `enrichTitle` — with/without description, truncation at 200 chars (3 cases)
- [x] 4.7 Unit test: both paths legitimately empty (no errors) → resolves to `[]`, no throw
- All 9 tests passing (3 `enrichTitle` + 6 `fetchGithubTrending`)

## 5. Verification

- [x] 5.1 `npx tsc --noEmit`, `eslint`, and `npm test` all clean — 82/82 passing (73 from the three preceding changes + 9 new)
- [x] 5.2 **Verified live against the real dev DB, with a striking before/after**: every pipeline run observed before this change (4 of them, across the three preceding changes' verification) showed `github_trending` at exactly `fetched: 17`. After this change, the same live setup shows **`fetched: 42`** — the Search API path added ~25 new candidates (matching `per_page=25`), on top of the scrape's unchanged 17.
- [x] 5.3 **Verified live in the same run**: `hash_deduped: 17` out of `fetched: 42` (40.5%, down from the previous steady-state of 100%). This is exactly the predicted shape — the *original* 17 scraped repos are still fully starved (unchanged, correctly out of scope per design.md), while the 25 Search-API-sourced repos are new enough to survive hash-dedup.
- [x] 5.4 **Verified live**: temporarily pointed both `fetchTrendingScrape` and `fetchRecentPopular` at invalid hosts, restarted the docker backend, triggered an ingest, and confirmed `GET /news-items/ingestion-runs` recorded `{"source":"github_trending","fetched":0,...,"error":"GitHub Trending: both fetch paths yielded nothing (scrape: fetch failed; search API: fetch failed)"}` — the soft-failure promotion works end-to-end through the observability stack, not just in unit tests. Reverted immediately after (confirmed via grep that no temp markers remained), retypechecked clean, restarted the container back to normal, and reran the full test suite (82/82) to confirm the revert was complete.
- [x] 5.5 **Verified live**: a standalone script calling the real `fetchGithubTrending()` against live GitHub sources showed 39/42 items with an enriched (em-dash) title, including a truncated real description ending in "…". (Nothing has reached `stored` yet in this environment — blocked by the same pre-existing, out-of-scope `embeddings.ts` bug documented in the two preceding changes — so this was verified at the fetch layer directly rather than via a stored `NewsItem`.)
