## Why

Every other source in this pipeline is community- or publisher-scoped (HN, Lobsters, dev.to, GitHub, Product Hunt, Stack Overflow, a curated RSS list, Mastodon trending links). A per-topic news search across the entire mainstream press ("AI regulation", "React", …) closes that coverage gap. This change originally targeted Google News's free RSS search endpoint, but live verification found that Google no longer performs server-side redirects from its `news.google.com/rss/articles/...` links to the publisher URL — those links now resolve to a Google-hosted interstitial page that navigates via client-side JavaScript, which a headless `fetch()` cannot execute (see design.md's "History" section for the full investigation). The source is instead built on **GNews.io**, an officially documented third-party news-search API whose results already carry the real publisher URL, eliminating the entire canonicalization problem the Google RSS approach required.

## What Changes

- New adapter `gnews`: per configured topic, `GET https://gnews.io/api/v4/search?q=<topic>&lang=en&max=10&apikey=<key>`, capped at 3 topics per run (well under GNews.io's 100-requests/day free-tier budget at 8 runs/day).
- New env vars `GNEWS_API_KEY` (required for this source to do anything) and `NEWS_INGESTION_GNEWS_QUERIES` (comma-separated topics); either unset → the adapter reports itself unconfigured without any network call, same pattern as every other credential/config-gated adapter in this pipeline.
- Field mapping is direct — no canonicalization step needed: `source: 'gnews'`, `source_id`/`url`: the article's `url` (already the real publisher link), `title`: `article.title`, `snippet`: `article.description`, `published_at`: `article.publishedAt`, no engagement (`raw_points: 0`, matching every other RSS-shaped item in this pipeline).
- Per-query failure isolation (`Promise.allSettled`) so one failing topic doesn't block the others; throws only when every configured query failed.

**Capabilities:** MODIFIED `news-ingestion` (spec-wise an `ADDED Requirements` entry on the existing capability).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: adds the GNews.io query source as a new (`ADDED Requirements`) requirement — per-topic search capped at 3 queries, direct publisher-URL mapping (no redirect resolution needed), and default-off configuration.

## Impact

- New: `backend/src/app/modules/NewsIngestion/adapters/gnews.ts` (replaces the abandoned `googleNews.ts`, which never stored any item — the canonicalization gate correctly dropped everything it fetched, so there is no existing `content_hash` backlog under `source: 'google_news'` to migrate).
- `backend/src/app/config/index.ts` — `GNEWS_API_KEY` and `NEWS_INGESTION_GNEWS_QUERIES` in `envSchema`, `news_ingestion.gnews: { api_key, queries }`.
- `backend/.env.example` — document both vars (sign-up URL, free-tier request budget, off by default).
- New test: `backend/src/__tests__/newsIngestion.gnews.test.ts`.
- No frontend changes — the `gnews` label flows into run-history summaries and the Admin UI automatically via the existing `unionSourceKeys` mechanism.
