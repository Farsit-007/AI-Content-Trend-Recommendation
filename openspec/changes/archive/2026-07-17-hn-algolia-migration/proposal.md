## Why

The Hacker News adapter costs 31 HTTP requests per run (`topstories.json` + 30 individual item fetches) to return 30 stories, and only sees a single front-page snapshot per run — it misses stories that rise between the 3-hourly cron executions. Algolia's official HN Search API delivers the same front page in one request and a second "risers" query (stories with `points > 50`, sorted by date) catches stories gaining traction between snapshots, at a published 10k requests/hour unauthenticated. As this pipeline's adapter count grows, HN should shrink to its fair share of request/cost budget instead of dominating it.

## What Changes

- Rewrite the internals of `adapters/hackerNews.ts` to call two Algolia HN Search endpoints instead of the Firebase API: `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30` and `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E50&hitsPerPage=50`, merged and deduplicated by `objectID` (front-page hit wins on conflict).
- Per-call try/catch with throw-only-if-both-fail (the existing devto two-endpoint pattern) — a single failed query no longer kills the whole adapter run.
- **Identity is preserved exactly** so `content_hash` values for already-stored HN items remain unchanged: `source` stays `'hackernews'`, `source_id` stays the HN numeric id as a string, and item `url` stays the story's submitted URL, falling back to `https://news.ycombinator.com/item?id=<id>` for URL-less stories (e.g. Ask HN) — the identical fallback format the old Firebase adapter used.
- Engagement/field mapping: `points → raw_points`, `num_comments → raw_comments`, `created_at_i` (epoch seconds) `× 1000 → published_at`, `story_text` stripped via the shared `htmlText.ts` helper (from the `lobsters-adapter` change) → `snippet`.
- No config, registry, or frontend changes — same exported function name (`fetchHackerNews`) in the same file, so the existing registry entry needs no edit.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: replaces the Hacker News source's fetch mechanism (Firebase → Algolia, `MODIFIED Requirements`, full restated text) while preserving its identity contract (`source`, `source_id`, `url` fallback) so `content_hash` compatibility holds across the migration and no previously stored item re-ingests.

## Impact

- `backend/src/app/modules/NewsIngestion/adapters/hackerNews.ts` — full rewrite of internals; same file, same exported `fetchHackerNews` name.
- New test: `backend/src/__tests__/newsIngestion.hackernews.test.ts` (none currently exists) covering merge/dedupe, URL fallback, one-call-failure survival, both-fail throw, and hash-compatibility against the old mapping rules.
- No config, env var, adapter-registry, or frontend changes.
- Depends on `htmlText.ts` (introduced by the `lobsters-adapter` change, already present in the repo) for snippet stripping.
