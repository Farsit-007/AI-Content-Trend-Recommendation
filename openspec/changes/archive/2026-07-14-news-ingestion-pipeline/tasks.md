## 1. Setup

- [x] 1.1 Add `rss-parser` and `node-cron` (+ `@types/node-cron` if needed) to `backend/package.json`
- [x] 1.2 Add new env vars to `backend/src/app/config/index.ts` (all optional/defaulted): `NEWS_INGESTION_RSS_FEEDS` (comma-separated URLs), `NEWS_INGESTION_MAX_AGE_HOURS`, `NEWS_INGESTION_MIN_RELEVANCE`, `NEWS_INGESTION_CRON`, `REDDIT_SUBREDDITS` (comma-separated, e.g. `programming,technology,artificial`)
- [x] 1.3 Create module structure `backend/src/app/modules/NewsIngestion/` with an `adapters/` subfolder

## 2. Source Adapters (Layer 1: Fetch & Normalize)

- [x] 2.1 Define shared `RawNewsItem` type (`source`, `source_id`, `title`, `url`, `snippet`, `published_at`, `raw_points`, `raw_comments`, `raw_stars_delta`) in `newsIngestion.interface.ts`
- [x] 2.2 Implement `adapters/hackerNews.ts` — Firebase API (`topstories.json` + `item/{id}.json`), map `points`/`descendants`
- [x] 2.3 Implement `adapters/devto.ts` — `GET /api/articles?top=7`, map `public_reactions_count`/`comments_count`
- [x] 2.4 Implement `adapters/githubTrending.ts` — scrape `github.com/trending`, parse repo name/description/"stars today"
- [x] 2.5 Implement `adapters/reddit.ts` — iterate `REDDIT_SUBREDDITS`, `GET /r/{sub}/top.json` with custom `User-Agent`, map `ups`/`num_comments`
- [x] 2.6 Implement `adapters/rss.ts` — parse `NEWS_INGESTION_RSS_FEEDS` via `rss-parser`, default engagement fields to 0
- [x] 2.7 Implement `runAllAdapters()` that calls every adapter in parallel, wraps each in try/catch so one failure doesn't reject the others, and returns `{ source, items, error? }[]`

## 3. Dedup & Freshness (Layer 2)

- [x] 3.1 Implement `computeContentHash(source, url)` (sha256)
- [x] 3.2 Implement batch lookup of existing `content_hash`es already in `NewsItem` (single query) and in-run dedup via a `Set`
- [x] 3.3 Implement freshness filter using `NEWS_INGESTION_MAX_AGE_HOURS`, treating missing/unreliable `published_at` as fresh

## 4. Relevance & Trend Scoring (Layer 3)

- [x] 4.1 Implement fetching all `BrandVoiceExample` embeddings once per run (pool)
- [x] 4.2 Implement cosine similarity helper and `scoreRelevance(itemEmbedding, pool)` returning max-similarity scaled 0–10, or `undefined` when pool is empty
- [x] 4.3 Implement `scoreTrend(raw_points, raw_comments, raw_stars_delta)` per the log-scale formula in design.md
- [x] 4.4 Wire embedding generation (`embed()` from `lib/embeddings.ts`) into this layer for each surviving item
- [x] 4.5 Apply `NEWS_INGESTION_MIN_RELEVANCE` threshold — discard items below it only when the brand-voice pool is non-empty

## 5. Categorization & Opportunity Scoring (Layer 4)

- [x] 5.1 Implement `categorizeBatch(items)` — batches ~10 items per `chatCompletion()` call using `LLM_MODELS.standard`, prompts for strict JSON `{ id, category, impact_note, opportunity_score }`
- [x] 5.2 Implement fallback handling for missing/malformed per-item results (`category: 'Other'`, derived `opportunity_score`)
- [x] 5.3 Assemble final `NewsItem` payloads (`processed: true`) and bulk-insert via `NewsItem.insertMany` (or `NewsItemService.createNewsItem` per item if simpler)

## 6. Pipeline Orchestration & Summary

- [x] 6.1 Implement `runIngestionPipeline(): Promise<IngestionSummary>` in `newsIngestion.service.ts` chaining layers 1–4 and tracking per-source fetched/deduped/discarded/stored counts
- [x] 6.2 Add unit-level manual verification (e.g. a throwaway script or ts-node run) confirming the pipeline runs end-to-end against real APIs in dev — ran live via the dev server, see section 10

## 7. Manual Trigger Endpoint

- [x] 7.1 Add `newsIngestion.controller.ts` with an `ingestNews` handler calling `runIngestionPipeline()` and returning the summary via `sendResponse`
- [x] 7.2 Add `POST /news-items/ingest` route in `newsItem.route.ts`, gated by `requireAuth` + `requireAdmin` (mirroring existing admin-only routes)
- [x] 7.3 Verify a non-admin request is rejected and an admin request returns the run summary — unauthenticated request returned 401, admin-token request returned a full run summary

## 8. Scheduled Trigger

- [x] 8.1 Create `backend/src/app/lib/scheduler.ts` using `node-cron`, scheduling `runIngestionPipeline()` on `NEWS_INGESTION_CRON`
- [x] 8.2 Start the scheduler from `server.ts` after `verifyConnections()` succeeds
- [x] 8.3 Confirm the scheduled run logs its summary and does not crash the server process on adapter/LLM failure — server booted with `[scheduler] News ingestion scheduled: 0 */3 * * *` logged; the scheduler calls the exact same `runIngestionPipeline()` verified resilient to adapter failures below (Reddit 403s didn't crash the run), so the same guarantee applies to the cron-triggered call. Did not wait out a live 3-hour interval to observe an actual scheduled fire.

## 9. Frontend Wiring

- [x] 9.1 Update `frontend/components/admin/AdminPanel.tsx`'s "Run News Ingestion" card to call `POST /news-items/ingest` instead of the mock `setTimeout`, surfacing the returned summary in the success toast
- [x] 9.2 Confirm the Feed page (`frontend/app/(dashboard)/dashboard/feed/page.tsx`) can be pointed at real `GET /news-items` data (still fine to leave on mock data if the real-data wiring is a separate change — verify this doesn't break either way) — left on mock data (`MOCK_NEWS_ITEMS`), out of scope for this change per CLAUDE.md's mock-data-first convention; unaffected by the new endpoint

## 10. Verification

- [x] 10.1 Run `npm run typecheck` and `npm run lint` in `backend/` — both clean (lint has only pre-existing-style `no-console` warnings, no errors)
- [x] 10.2 Manually trigger `POST /news-items/ingest` as an admin in dev and confirm `NewsItem` documents appear in MongoDB with populated `category`, `trend_score`, `relevance_score` (or unset if cold start), `opportunity_score`, `impact_note`, `processed: true` — ran live against real HN/Dev.to/GitHub Trending/Reddit APIs + real OpenRouter LLM/embedding calls + real Atlas DB; stored 44 items with all fields populated correctly (relevance_score correctly left unset — zero BrandVoiceExample docs exist, confirming the cold-start fallback)
- [x] 10.3 Confirm re-running the endpoint immediately afterward reports these same items as deduped, not re-stored — second run returned in 1.6s (vs 82s) reporting all 44 as `deduped`, `totalStored: 0`
