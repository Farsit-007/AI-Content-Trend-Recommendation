## 0. Abandoned: Google News RSS (kept for record — see design.md "History")

- [x] 0.1 Implemented, tested, and live-verified the original Google News RSS + redirect-canonicalization design (`adapters/googleNews.ts`). Live verification found Google no longer performs server-side redirects on `news.google.com/rss/articles/...` links — confirmed systematic across multiple topics via manual `redirect: 'manual'` probes (302 back to the same host, followed by a JS-only interstitial). The adapter's safety gate worked correctly (dropped everything rather than storing a wrong-domain URL) but the source degraded to zero usable items with no in-pipeline fix. Deleted `adapters/googleNews.ts` and its config/registry entries; replaced with the GNews.io-backed adapter below.

## 1. Config

- [x] 1.1 `envSchema`: add `GNEWS_API_KEY: z.string().optional()` and `NEWS_INGESTION_GNEWS_QUERIES: z.string().optional()`; export `news_ingestion.gnews: { api_key, queries }` (queries split/trim/filtered, matching the `rss_feeds`/`mastodon_instances` idiom); document both in `backend/.env.example` (sign-up URL, 100 req/day free-tier budget, off by default)

## 2. Adapter

- [x] 2.1 Create `adapters/gnews.ts`: unconfigured guard — throw `'gnews not configured (GNEWS_API_KEY/NEWS_INGESTION_GNEWS_QUERIES unset)'` before any network call when either is absent
- [x] 2.2 Slice the configured query list to the first 3, logging a warning if more were configured
- [x] 2.3 Per query: `GET https://gnews.io/api/v4/search?q=<encoded topic>&lang=en&max=10&apikey=<key>`; non-OK response throws surfacing the response body's `errors` detail when present; wrap each query in `Promise.allSettled` so one failing query doesn't block the others
- [x] 2.4 Map fields directly (no canonicalization needed): `source: 'gnews'`, `source_id`/`url`: `article.url`, `title`: `article.title`, `snippet`: `article.description`, `published_at: new Date(article.publishedAt)`, `raw_points: 0`, `raw_comments: 0`, `raw_stars_delta: 0`
- [x] 2.5 Throw only when every configured query failed (join the per-query failure reasons); otherwise log failures and return the successful queries' items
- [x] 2.6 Register `{ source: 'gnews', fetch: fetchGNews }` in `adapters/index.ts`, removing the old `google_news` entry

## 3. Tests

- [x] 3.1 `newsIngestion.gnews.test.ts`: article mapping uses the API's `url` directly; query list sliced to 3 with a logged warning when more are configured; unconfigured (missing key or empty query list) makes zero fetch calls; one query failing still returns the other queries' items; all-queries-failing throws; a non-OK response with an `errors` body surfaces that detail

## 4. Verification

- [x] 4.1 `cd backend && npm test && npm run build` — 133/133 passing, clean build
- [x] 4.2 Configured the real `GNEWS_API_KEY` (provided by the user, GNews.io) + topic "artificial intelligence", manual ingest against live Atlas/Redis → `gnews` `fetched: 10, stored: 10`. Verified all 10 stored items directly: **0 of 10** resolved to `news.google.com` or `gnews.io` — real, diverse publisher domains (`economictimes.indiatimes.com`, `www.tribuneindia.com`, `www.outlookbusiness.com`, …), each with a real `published_at`.
- [x] 4.3 Ran ingestion a second time → `gnews` `fetched: 10, deduped: 10, stored: 0` — all 10 previously-stored URLs correctly hash-deduped, nothing re-stored. Left `GNEWS_API_KEY`/`NEWS_INGESTION_GNEWS_QUERIES` configured in `backend/.env` (unlike the earlier disable-test toggles, this is meant to run going forward, not just prove the disabled path).
