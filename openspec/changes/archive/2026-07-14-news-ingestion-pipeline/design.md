## Context

`NewsItem` (`backend/src/app/modules/NewsItem/`) is currently CRUD-only — no code fetches external content into it. The Feed/Admin/Report frontend pages are all built against `frontend/lib/mock/news.ts`. The Admin panel already has a "Run News Ingestion" button (`frontend/components/admin/AdminPanel.tsx`) whose copy promises pulling from "HackerNews, Dev.to, GitHub, Reddit, RSS" through a "4-layer filter pipeline" — that copy is the product spec this change implements.

Constraints from the existing codebase:
- `NewsItem` is deliberately global/unscoped, not per-team (`[[project-multiteam-rbac]]` memory) — relevance can't be scoped to one team's brand voice, so it must be computed against something team-agnostic.
- `embed()` (`lib/embeddings.ts`) and `chatCompletion()` (`lib/llmClient.ts`) already wrap OpenRouter; both throw on failure, no built-in retry.
- The `news_items` and `brand_voice_examples` collections already have Atlas vector search indexes (`createVectorIndexes.ts`) on `embedding` (1536-dim, cosine) — available if needed, but for a single ingestion run pooling in-memory cosine similarity against all brand voice examples is simpler than a vector search round-trip per item.
- No HTTP/XML dependency exists yet beyond the `openai` SDK — Node 22's built-in `fetch` covers all JSON/HTML sources; only RSS needs a new dependency.
- Config follows a strict zod schema in `config/index.ts` — every new env var must be added there, not read via `process.env` directly.

## Goals / Non-Goals

**Goals:**
- Real, end-to-end ingestion from HackerNews, Dev.to, GitHub Trending, Reddit, and a curated RSS list into `NewsItem` documents.
- A 4-layer pipeline (fetch/normalize → dedupe/freshness → relevance/trend scoring → categorize/opportunity scoring) where only items that clear all layers get stored.
- One shared pipeline function invoked identically by a manual admin-only endpoint and a recurring in-process cron job.
- Graceful degradation: one source failing (e.g. GitHub HTML layout changes) must not fail the whole run.

**Non-Goals:**
- Per-team news scoping — `NewsItem` stays global.
- OAuth for Reddit/GitHub — public/unauthenticated endpoints only.
- Cross-source semantic dedup (same story appearing on both HN and Dev.to) — only exact-URL dedup via `content_hash`.
- A persisted ingestion-run history/audit log collection — the endpoint returns a synchronous summary; no new collection.
- Historical backfill or pagination beyond each source's "top N right now."
- A separate worker process/job queue — the cron runs in the same Node process as the API.

## Decisions

**Adapter pattern, one module per source.** Each source lives in `backend/src/app/modules/NewsIngestion/adapters/` and exports `fetchRaw(): Promise<RawNewsItem[]>` returning a common shape (`source`, `source_id`, `title`, `url`, `snippet`, `published_at`, `raw_points`, `raw_comments`, `raw_stars_delta`). Alternative considered: one monolithic fetch function — rejected because each source has a different failure mode (HTML scrape vs JSON API vs RSS) and isolating them makes the "one source failing doesn't kill the run" goal trivial (wrap each adapter call in its own try/catch).
- **HackerNews**: Firebase REST API (`topstories.json` + `item/{id}.json`), no key required. `points` → `raw_points`, `descendants` → `raw_comments`.
- **Dev.to**: `GET https://dev.to/api/articles?top=7`, no key required. `public_reactions_count` → `raw_points`, `comments_count` → `raw_comments`.
- **GitHub Trending**: scrape `https://github.com/trending` HTML (no official trending API exists). Parse repo name/description/"stars today" text into `raw_stars_delta`. Flagged as the most fragile adapter (see Risks).
- **Reddit**: `GET https://www.reddit.com/r/{subreddit}/top.json?limit=25` with a custom `User-Agent` header (required — Reddit blocks the default fetch UA); subreddit list is a config array (e.g. `programming`, `technology`, `artificial`). `ups` → `raw_points`, `num_comments` → `raw_comments`.
- **RSS**: new dependency `rss-parser` against a configurable list of feed URLs (env var, comma-separated). No engagement data available — `raw_points`/`raw_comments`/`raw_stars_delta` default to 0; these items rely on recency + relevance/category scoring rather than trend_score.

**Dedup key: `content_hash = sha256(`${source}:${url}`)`.** Computed in the normalize step, matching the existing unique index on `NewsItem.content_hash`. Before inserting, the pipeline batch-queries `NewsItem.find({ content_hash: { $in: [...] } }, { content_hash: 1 })` once per run (not once per item) and also dedupes within the same run via a `Set`, since the same URL can appear from more than one source pass.

**Freshness window**: items older than a configurable `NEWS_INGESTION_MAX_AGE_HOURS` (default 72h) are discarded before embedding/LLM calls, to avoid wasting API calls scoring stale content. RSS/GitHub items without a reliable `published_at` are treated as fresh (can't filter what you can't parse reliably).

**Relevance scoring: pooled `BrandVoiceExample`, max-similarity.** At the start of a run, fetch all `BrandVoiceExample` embeddings once (single query, held in memory for the run). For each candidate item, `relevance_score = round(max(cosineSimilarity(item.embedding, be.embedding) for be in pool) * 10, 1)` — max rather than average, so a small or lopsided brand-voice set (e.g. only one team has submitted examples) doesn't drag every item's score down. **Cold-start fallback**: if the pool is empty (no team has added brand voice examples yet), skip relevance filtering entirely (`relevance_score` left `undefined`, item passes this layer) rather than discarding every single item on day one. Alternative considered: score relevance per-team and store an array — rejected, `NewsItem` schema has a single scalar `relevance_score` and is intentionally unscoped.

**Relevance threshold**: `NEWS_INGESTION_MIN_RELEVANCE` (default `4.0` on the 0–10 scale) — items scoring below this (when a pool exists) are discarded in layer 3, not stored.

**Trend scoring: deterministic formula, no LLM.** `trend_score = min(10, round(log10(raw_points + raw_comments * 2 + raw_stars_delta * 3 + 1) * 3, 1))`. Log-scaled because raw engagement numbers vary by orders of magnitude across sources (HN points vs GitHub stars vs Reddit upvotes); cheap and deterministic so it doesn't need an LLM round-trip.

**Categorization + opportunity score: one batched LLM call per group of ~10 surviving items**, using `LLM_MODELS.standard` via `chatCompletion()`. Prompt asks for strict JSON: `{ id, category, impact_note, opportunity_score }` per item, where `category` is constrained to the frontend's existing enum (`AI | Web Dev | Career | Security | DevOps | Other`) and `opportunity_score` (0–10) is the LLM's holistic judgment given the item's title/snippet, its `relevance_score`, and its `trend_score` as context. Batching (rather than one call per item) keeps a ~50-item run to ~5 LLM calls instead of 50.

**Shared pipeline entrypoint**: `runIngestionPipeline(): Promise<IngestionSummary>` in `newsIngestion.service.ts` is the single function both triggers call — the admin route calls it synchronously and returns its result; the cron job calls it and only logs the result. No duplicated orchestration logic.

**Trigger 1 — manual**: `POST /news-items/ingest`, gated by `requireAdmin` (existing middleware, matches `[[project-multiteam-rbac]]`'s "admin bypasses all team-scoping" pattern — this route has no team scoping to begin with since `NewsItem` is global). Mounted in `newsItem.route.ts` alongside the existing CRUD routes since it operates on the same resource.

**Trigger 2 — cron**: a new `lib/scheduler.ts` using `node-cron` (new dependency), started from `server.ts` after `verifyConnections()` succeeds, on schedule `NEWS_INGESTION_CRON` (default `0 */3 * * *`, every 3 hours). Runs in-process — acceptable for hackathon scope; if it becomes a real product this would move to a separate worker, but that's out of scope here.

## Risks / Trade-offs

- **[Risk] GitHub Trending has no official API — HTML scraping breaks silently if GitHub changes markup.** → Mitigation: isolate in its own adapter with its own try/catch; a failed/empty parse logs a warning and contributes 0 items to that run rather than throwing and killing the other 4 sources.
- **[Risk] Reddit's unauthenticated JSON endpoint is rate-limited and may 429 under repeated polling.** → Mitigation: set a descriptive `User-Agent`, keep the cron interval at hours not minutes, and treat a 429 like any other adapter failure (skip, log, continue).
- **[Risk] Cold start — zero `BrandVoiceExample` docs means every item's relevance is meaningless.** → Mitigation: documented fallback above (skip relevance filtering when pool is empty); this is a temporary state until the first team submits brand voice examples, not a permanent design compromise.
- **[Risk] Batched LLM categorization calls can fail parsing (non-JSON response) or partially fail (some items missing from the response).** → Mitigation: any item missing from a batch's parsed response falls back to `category: 'Other'`, `opportunity_score = relevance_score` (or `trend_score` if relevance is undefined), and a generic `impact_note` — the run must never throw because one LLM batch was malformed.
- **[Trade-off] In-process cron means ingestion runs share the API server's event loop/memory.** Acceptable at this scale (≤~50 items, ≤~5 LLM calls per run, every few hours); would need to move to a separate process before this became a real scheduled production job with much higher item volume.

## Migration Plan

No data migration — `NewsItem`'s schema already has every field this pipeline writes to. Steps:
1. Add new env vars to `config/index.ts` (all with safe defaults except none are required — ingestion should not block server boot if e.g. RSS feed list is empty).
2. Add `rss-parser` and `node-cron` to `backend/package.json`.
3. Ship the adapters + pipeline + route behind `requireAdmin` — no user-facing exposure until an admin clicks the button or the cron fires.
4. Deploy with `NEWS_INGESTION_CRON` unset/disabled first if a quiet rollout is wanted, then enable once a manual run has been verified.

**Rollback**: unset/disable the cron env var and stop calling the endpoint; no destructive schema changes to revert.

## Open Questions

- GitHub Trending scrape window (daily vs weekly "trending") — defaulting to daily; revisit if daily proves too noisy for opportunity scoring.
- Whether a persisted ingestion-run log (for observability beyond the synchronous response) is worth a new collection — deferred as a non-goal; can be added later if the synchronous summary proves insufficient during the demo.
