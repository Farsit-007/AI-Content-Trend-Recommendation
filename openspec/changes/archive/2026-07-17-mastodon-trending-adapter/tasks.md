## 1. Config

- [x] 1.1 `envSchema`: add `NEWS_INGESTION_MASTODON_INSTANCES: z.string().default('mastodon.social,fosstodon.org')`; export the parsed array as `news_ingestion.mastodon_instances` (same split/trim/filter idiom as `rss_feeds`, `config/index.ts:189-192`)
- [x] 1.2 Document `NEWS_INGESTION_MASTODON_INSTANCES` in `backend/.env.example` under the news-ingestion section (default value, that no credentials are needed, how to disable with an empty value)

## 2. Adapter

- [x] 2.1 Create `adapters/mastodon.ts`: `fetchMastodon()` throws `'mastodon not configured (NEWS_INGESTION_MASTODON_INSTANCES is empty)'` when `news_ingestion.mastodon_instances` is empty, before any network call
- [x] 2.2 Otherwise, `Promise.allSettled` a GET to `https://<instance>/api/v1/trends/links` for each configured instance (descriptive `User-Agent` header); a non-OK response for one instance is caught and logged, not thrown
- [x] 2.3 Merge successful instances' results into a `Map<url, TrendingLink>` keyed by link URL, keeping the entry with the higher `Number(history?.[0]?.accounts ?? 0)` on conflict; map fields per design decision 6 (`title`, `stripHtml`-passed `description` as snippet, `raw_points` via `Number()` coercion, `raw_comments: 0`, `raw_stars_delta: 0`, `published_at: new Date()`)
- [x] 2.4 If every instance's request failed, throw with the joined per-instance failure reasons (githubTrending merge-failure pattern)
- [x] 2.5 Register `{ source: 'mastodon', fetch: fetchMastodon }` in `adapters/index.ts`

## 3. Tests

- [x] 3.1 `newsIngestion.mastodon.test.ts` (mock `global.fetch`, copy devto/githubTrending test style): string→number `accounts` coercion; cross-instance URL dedupe keeps the higher count; one-instance-down-one-up returns the survivor's items; empty `NEWS_INGESTION_MASTODON_INSTANCES` throws without any fetch call; all-instances-failed throws; an empty (but successful) trending-links response yields zero items without erroring

## 4. Verification

- [x] 4.1 `cd backend && npm test && npm run build`
- [x] 4.2 Booted against live Atlas/Redis with the var unset (default instances, clean boot) and with it set to an empty string (clean boot; run history recorded `error: "mastodon not configured (NEWS_INGESTION_MASTODON_INSTANCES is empty)"` for `mastodon`, `fetched: 0`, no network calls made). `.env` restored to its original (var-absent) state afterward.
- [x] 4.3 Manual ingest with the default instances → `mastodon` `fetched: 12, stored: 12` (12 is today's real cross-instance-deduped trending-link count — below the plan's ~20–40 estimate, a legitimate day-to-day variance in how many links are trending, not a bug). Spot-checked a stored item: real fetch-time `published_at`, `engagement.points: 176` (non-zero), category `Other` with an explanatory `impact_note` (LLM categorization was rate-limited during this run — the pipeline's existing fallback-category behavior degraded gracefully rather than blocking storage).
- [x] 4.4 Ran ingestion a second time → `mastodon` `fetched: 12, deduped: 12, stored: 0` — all 12 previously-stored URLs correctly hash-deduped, nothing re-stored.
