## 1. RSS per-feed labeling

- [x] 1.1 In `backend/src/app/modules/NewsIngestion/adapters/rss.ts`, add a `feedLabel(feedUrl: string): string` helper returning `rss:<hostname>` (hostname lowercased, leading `www.` stripped) and falling back to `rss` when `new URL(feedUrl)` throws
- [x] 1.2 Pass the label into `fetchFeed` and use it as each normalized item's `source` (replacing the hardcoded `'rss'` at `rss.ts:14`); leave `source_id`, `url`, and every other field untouched
- [x] 1.3 Unit test `feedLabel`: `https://www.techcrunch.com/feed/` → `rss:techcrunch.com`; `https://medium.com/feed/tag/programming` → `rss:medium.com`; malformed URL → `rss` (no throw)
- [x] 1.4 Unit test: one failing feed among several still returns the other feeds' items (guards the existing per-feed catch at `rss.ts:29-32`)

## 2. Ingestion summary union fix

- [x] 2.1 In `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts:36`, replace `const sources = adapterResults.map((r) => r.source)` with the union of adapter names and `Object.keys(fetchedCounts)`, preserving deterministic ordering (adapter names first, then any additional item labels) — implemented as exported `unionSourceKeys` + `buildSourceSummaries`
- [x] 2.2 Confirm the `SourceSummary` construction at `:127-134` produces one row per union member, keeping zero-count rows for adapters that fetched nothing or threw
- [x] 2.3 Leave the existing `IngestionSummary` return shape and the approximation comment at `:125-126` unchanged (the manual endpoint's response contract must stay stable)
- [x] 2.4 Unit test: an adapter emitting two distinct `rss:<host>` labels yields two summary rows; an adapter that threw yields a zero-count row

## 3. Dev.to fetch window

- [x] 3.1 In `backend/src/app/modules/NewsIngestion/adapters/devto.ts`, replace the single `?top=7` call with parallel `Promise.all` requests to `https://dev.to/api/articles?top=1&per_page=50` and `https://dev.to/api/articles?state=rising&per_page=50`
- [x] 3.2 Catch and log each request individually; merge both responses and dedupe by `article.id` via a `Map`; throw only when both requests fail
- [x] 3.3 Keep the existing `RawNewsItem` mapping (`:18-28`) unchanged — only the fetch/merge changes
- [x] 3.4 Unit test: an article id present in both responses appears exactly once in the output
- [x] 3.5 Unit test: `top` fails + `rising` succeeds → rising items returned, no throw; both fail → throws

## 4. Environment documentation

- [x] 4.1 Append a `# ---- News ingestion (all optional — server boots with none set) ----` section to `backend/.env.example` documenting each variable with its default and effect: `NEWS_INGESTION_RSS_FEEDS` (curated starter list from design.md §5), `NEWS_INGESTION_MAX_AGE_HOURS=72`, `NEWS_INGESTION_MIN_RELEVANCE=4.0`, `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD=0.88`, `NEWS_INGESTION_CRON=0 */3 * * *`, `REDDIT_SUBREDDITS=programming,technology,artificial`, `NEWS_INGESTION_CATEGORY_CONFIDENCE_THRESHOLD=0.6`, `NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE=0.4`, `NEWS_INGESTION_OPPORTUNITY_WEIGHT_TREND=0.3`, `NEWS_INGESTION_OPPORTUNITY_WEIGHT_FIT=0.3`, `NEWS_INGESTION_OPPORTUNITY_FALLBACK_RELEVANCE=5.0`
- [x] 4.2 Annotate `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` as live-calibrated against `openai/text-embedding-3-small` — changing it or `EMBEDDING_MODEL` invalidates the threshold and requires re-running `npm run verify:semantic-dedup-live`
- [x] 4.3 Annotate the three `NEWS_INGESTION_OPPORTUNITY_WEIGHT_*` vars as required to sum to exactly 1 (enforced by the `superRefine` at `backend/src/app/config/index.ts:93-105`)
- [x] 4.4 Operator step: set `NEWS_INGESTION_RSS_FEEDS` to the starter list in local `backend/.env` (done — gitignored, verified present). Production host env is outside this session's access — still an operator action for whoever manages that host.

## 5. Verification

- [x] 5.1 `cd backend && npm run build` passes (confirmed); server confirmed to boot cleanly with every `NEWS_INGESTION_*`/`REDDIT_SUBREDDITS` var stripped from `.env` (live boot test, then `.env` restored — diffed byte-identical against the pre-test backup)
- [x] 5.2 Verified at the adapter level with live network calls (see note below): RSS fetched 150 items across 6 `rss:<host>` labels; dev.to fetched 61 items post-merge/dedupe, **100% within the 72h freshness window** (vs. the old `?top=7` window, which was mostly outside it)
- [x] 5.3 Confirmed live: 30 items fetched under `rss:medium.com` from the three configured Medium tag feeds, with real titles/URLs (Medium fixed)
- [ ] 5.4 **Blocked** — could not inspect stored items for HN/RSS twins because no run reached the DB insert step (see blocker note below)
- [ ] 5.5 **Blocked** — could not run a second ingest to observe hash-dedup convergence for the same reason

### Blocker found during verification (pre-existing, out of scope for this change)

`POST /api/v1/news-items/ingest` returns HTTP 500 from `backend/src/app/lib/embeddings.ts:10` (`Cannot read properties of undefined (reading '0')`, i.e. `response.data` is undefined) partway through Layer 2b, on both the long-running Docker container and a fresh local server. Confirmed **not caused by this change**: `embeddings.ts` has zero diff, and the `newsIngestion.service.ts` diff is scoped to the summary-building code (verified via `git diff --stat`). Confirmed **not a simple concurrency/rate-limit ceiling**: 220 concurrent synthetic `embed()` calls against the real OpenRouter endpoint all succeeded in isolation. The failure only reproduces when embedding real fetched content (titles/snippets), so it is most likely content-shape-specific (e.g. unbounded RSS `contentSnippet` length, or unicode in non-English Medium titles) hitting an edge case OpenRouter's embeddings endpoint doesn't like, which `embed()` doesn't defensively handle. This bug pre-dates this change and became visible only because this change is what first gets RSS/dev.to to deliver real volume into Layer 2b. Recommend filing it as its own fix (belongs with the master doc's "LLM cost & failure discipline" caveat, not this change's scope) before Change 2 (`ingestion-run-observability`) is applied, since that change needs a working end-to-end run to verify its own DoD.
