## Why

`NewsItem` currently only exists as a CRUD module — nothing in the backend actually fetches external content. The Feed page and Admin panel are wired against mock data, and the admin "Run News Ingestion" button is a 2-second `setTimeout` with no backend behind it. Growth Studio's core value (surfacing trending, on-brand content ideas) depends on a real pipeline that pulls from external sources, scores and filters what it finds, and populates `news_items` so the Feed, Report, and Chat features have real data to work with.

## What Changes

- Add source adapters for HackerNews, Dev.to, GitHub Trending, Reddit, and curated RSS feeds, each normalizing raw results into a common shape (title, url, snippet, published_at, source, source_id, raw engagement metrics).
- Add a 4-layer filter/enrichment pipeline that turns normalized raw items into `NewsItem` documents:
  1. **Fetch & Normalize** — run all source adapters, normalize output.
  2. **Dedupe & Freshness** — compute `content_hash`, skip items already stored or older than a configurable window.
  3. **Relevance & Trend Scoring** — embed each item; score `relevance_score` via cosine similarity against the pooled set of all `BrandVoiceExample` embeddings; score `trend_score` from normalized source engagement (points/comments/stars_delta).
  4. **Categorize & Score Opportunity** — LLM call assigns `category` (AI/Web Dev/Career/Security/DevOps/Other), writes `impact_note`, and combines relevance + trend into `opportunity_score`.
- Items that fail the freshness/dedupe layer or fall below a minimum relevance threshold are discarded, not stored — only items that survive all 4 layers become `NewsItem` documents with `processed: true`.
- Add `POST /news-items/ingest` (admin-only) that runs the full pipeline synchronously and returns a run summary (fetched/deduped/discarded/stored counts per source).
- Add a recurring background job (node-cron style scheduler process) that calls the same pipeline on an interval, so the feed refreshes without a manual trigger.
- Wire the frontend Admin panel's "Run News Ingestion" button to the new endpoint instead of the mock timeout.

## Capabilities

### New Capabilities
- `news-ingestion`: fetching from external sources, normalizing, deduping, scoring, and filtering into `NewsItem` records, exposed via a manual admin endpoint and a recurring scheduled job.

### Modified Capabilities
- None — `NewsItem`'s stored shape (`newsItem.interface.ts`) already has every field this pipeline needs (`content_hash`, `engagement`, `trend_score`, `relevance_score`, `opportunity_score`, `category`, `impact_note`, `processed`); no schema changes required.

## Impact

- **New code**: `backend/src/app/modules/NewsIngestion/` (adapters, pipeline stages, scheduler) and a new route mounted under `/news-items/ingest`.
- **Existing code touched**: `backend/src/app/modules/NewsItem/newsItem.route.ts` (new route), `backend/src/app/routes/index.ts` (no change expected — reuses `/news-items` mount), `backend/src/app/config/index.ts` (new env vars: RSS feed list, ingestion interval, min relevance threshold), `frontend/components/admin/AdminPanel.tsx` (real API call instead of mock timeout).
- **New dependency**: an XML/RSS parser (e.g. `rss-parser`) since none exists in `backend/package.json` today.
- **External APIs**: HackerNews Firebase API, Dev.to API, GitHub trending (HTML scrape — no official API), Reddit public JSON endpoints (User-Agent required, unauthenticated).
- **Uses existing infra**: `lib/embeddings.ts` (embed), `lib/llmClient.ts` (categorization/impact_note), `news_items_vector_index` (already created by `createVectorIndexes.ts`).
