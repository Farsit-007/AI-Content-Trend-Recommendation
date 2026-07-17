## Context

`news-full-content-sources` added `content`/`content_status`/`word_count`/`content_fetched_at` to `INewsItem`/`RawNewsItem` and populated them for six sources whose existing single request already returns fuller text (Reddit, Stack Overflow, Product Hunt, Lobsters, RSS `content:encoded`, Hacker News text posts). Verified live in that change's manual check: sources without that fuller text (TechCrunch, Wired RSS, Mastodon, GNews, dev.to, GitHub Trending, HN link posts) correctly store `content_status: 'none'`. This change targets exactly that remaining set.

`runIngestionPipeline` (`newsIngestion.service.ts:181-316`) runs six layers in order: adapters → hash/freshness dedup → embeddings → semantic dedup → relevance scoring/filtering (producing `relevant: ScoredNewsItem[]`, line 230-234) → `categorizeBatch(relevant)` (line 237) → payload assembly (`withContentMeta` already applied per-item, line 244-267) → `insertMany`. The correct enrichment insertion point is between the `relevant` computation and `categorizeBatch` — only items that survived every prior filter get fetched, which is the pipeline's existing pattern for cost control (the categorization LLM call already only processes `relevant`, not everything fetched).

`ScoredNewsItem extends RawNewsItem` (`newsIngestion.interface.ts:17-22`), so every item flowing through the pipeline by this point already carries `content?: string` (from `news-full-content-sources`) — enrichment only needs to fill it in when absent, never overwrite it.

Adapter identity facts needed for API-based enrichment: dev.to's `source_id` is `String(article.id)` (`devto.ts`), the numeric dev.to article id — `GET https://dev.to/api/articles/{id}` returns `body_markdown`. GitHub Trending's `source_id` is `owner/repo` on both its scrape path (`repoPath` from the trending-page HTML) and its Search-API path (`repo.full_name`) (`githubTrending.ts`) — directly usable as the path segment for `GET /repos/{source_id}/readme`.

`newsIngestion.categorize.ts`'s per-item prompt line is `` `${id}. "${item.title}" — ${item.snippet ?? 'no snippet'} (relevance_score=…, trend_score=…)` `` (line 41-46) — a widening point that needs no change to the strict-JSON response contract or fallback behavior.

`chat.retrieval.ts`'s `fetchNewsContext`/`rankNewsItems` build a context block per candidate news item from a Mongo projection that currently excludes `content` (`title snippet category impact_note trend_score opportunity_score embedding`, line 58-63).

`IngestionRun`'s `ISourceRunCount` (`ingestionRun.interface.ts`) and its mongoose subdocument schema (`ingestionRun.model.ts`) are per-source count records; `buildSourceRunCounts` (`newsIngestion.service.ts:103-134`) builds them from six `Record<string, number>` count maps threaded through `RunCountState`. Adding new optional counters is additive to both the interface and schema.

No article-extraction library is currently a dependency (`backend/package.json` has no `extractus`/`article-extractor`/`readability` entry).

## Goals / Non-Goals

**Goals:**
- Give every item still lacking `content` after `news-full-content-sources` a real chance at full text, using the best available source (an API where one exists, page extraction otherwise).
- Keep the added cost and latency bounded and controllable: only fetch items that survived relevance filtering, cap concurrency, cap per-request time, and provide a kill switch.
- Make every failure mode (timeout, non-HTML, oversized, non-2xx, empty extraction) degrade to `content_status: 'failed'` without ever dropping, delaying indefinitely, or otherwise altering an item — enrichment is additive, never gating.
- Widen categorization and chat to use content when present, without changing their existing contracts or fallback behavior.

**Non-Goals:**
- Fetching pages at content-*generation* time — this is exclusively an ingestion-time enrichment; `content-generation-news-grounding`'s consumption of `NewsItem.content` (already shipped) is unaffected by how that field got populated.
- Changing the embedding input text (`title + snippet`, `newsIngestion.utils.ts:56`) or content-hash identity.
- Re-enriching items already handled by `news-full-content-sources` (Reddit, Stack Overflow, Product Hunt, Lobsters, RSS-with-`content:encoded`, HN text posts) — the routing explicitly skips any item that already has `content`.
- A generic full headless-browser renderer for JS-only pages — out of scope; those pages fail soft to `content_status: 'failed'`, same as a paywall.

## Decisions

1. **Enrichment runs once, between relevance filtering and categorization, operating on `relevant: ScoredNewsItem[]`.** This mirrors the pipeline's existing "only do expensive work on survivors" pattern (categorization already only processes `relevant`) and bounds the request count to what a single run actually stores (~20-60 items observed live), not the hundreds fetched by adapters.
   - *Alternative considered*: enrich at adapter time (before dedup/relevance). Rejected — would fetch pages for items later discarded as duplicates or irrelevant, multiplying request volume for no benefit.
2. **Per-source routing table, three paths:** items with `source === 'devto'` → dev.to article-by-id API; `source === 'github_trending'` → GitHub README API; everything else *without* existing `content`ns → generic page extraction of `item.url`. Items that already carry `content` (from `news-full-content-sources`) are skipped untouched — the routing check comes first.
   - *Alternative considered*: route by "does it have a well-known API" registry keyed by source name generically. Rejected as premature generalization — only two sources currently have a better-than-generic option; a registry would be speculative for sources that don't exist yet.
3. **Generic extraction is fetch-then-extract, with the fetch always under our control.** A dependency (`@extractus/article-extractor`'s `extractFromHtml`) is used only for the HTML→article-text parsing step, never for the network request itself — so timeout, size limit, and content-type policy stay enforced uniformly regardless of library behavior.
   - *Alternative considered*: `extractFromUrl` (the library's own fetch-and-extract convenience function). Rejected — it would bypass our timeout/size/content-type guards, delegating request policy to the dependency.
   - *Alternative considered*: `jsdom`-based Readability. Rejected — heavier dependency footprint for a benefit (broader DOM API surface) this use case doesn't need; `linkedom`/`extractus` is lighter and sufficient for extracting article text from static HTML.
4. **Guard order for the generic path, each independently failing soft:** `AbortController`-based timeout (`NEWS_CONTENT_FETCH_TIMEOUT_MS`, default 10000ms) → non-2xx status check → `content-type` header must include `text/html` → response body size capped at 2MB → `extractFromHtml` → non-empty result required. Any failure short-circuits to `content_status: 'failed'` for that item; no retries (retrying a slow/dead page inside a single run only adds latency for a low-value item).
5. **Bounded concurrency via a small local helper (`mapWithConcurrency`), not a new dependency.** Default `NEWS_CONTENT_FETCH_CONCURRENCY = 3`, matching the pipeline's existing stated rationale for serial/bounded batching elsewhere (`newsIngestion.utils.ts`'s comment on `embedItems` batching to avoid flooding free-tier services). A tiny queue-based implementation avoids pulling in `p-limit` for one call site.
6. **Kill switch is a top-level boolean, checked once.** `NEWS_CONTENT_FETCH_ENABLED` (default `true`); when false, the pipeline skips the enrichment call entirely — zero enrichment HTTP requests, run behaves exactly as `news-full-content-sources` left it.
7. **The whole enrichment call is wrapped in a pipeline-level try/catch that logs and continues with unenriched items on any unexpected throw** — consistent with the categorization layer's existing fallback philosophy (a subsystem failure must never abort the run).
8. **Categorization widening is a one-line prompt addition, not a contract change**: `` `${id}. "${title}" — ${snippet} — content: ${content.slice(0, 500)} (relevance_score=…, trend_score=…)` `` when content exists, unchanged otherwise. Response shape, batching, and fallback are untouched.
9. **Chat widening adds `content` to the Mongo projection and one more line to the rendered block** (`Content: ${content.slice(0, 300)}`, only when present) — the ranking algorithm (`rankNewsItems`) itself is unaffected since it ranks on trend score then embedding similarity, neither of which changes.
10. **Run-count fields are optional and additive.** `content_fetched?: number` / `content_failed?: number` on `ISourceRunCount` — old persisted `IngestionRun` documents (from before this change) simply lack the fields; nothing reads them as required.

## Risks / Trade-offs

- **[Risk] Fetching arbitrary linked pages (TechCrunch, Wired, arbitrary blogs) at run time introduces a new external-network failure surface and modest latency to every ingestion run.** → **Mitigation**: bounded concurrency (3) and a 10s per-request timeout cap worst-case added wall time; every failure is soft and logged, never blocking; the kill switch provides an immediate rollback path with no code change.
- **[Risk] Paywalled or JS-rendered pages will consistently yield `content_status: 'failed'` and never improve.** → **Mitigation**: explicitly accepted as a non-goal (no headless rendering); these items already degrade gracefully today (snippet-only generation, per `content-generation-news-grounding`'s anti-hallucination instruction) — this change can only improve their status from `none` to `failed` at worst, never regress it.
- **[Risk] `@extractus/article-extractor` is a new third-party dependency with its own maintenance/security surface.** → **Mitigation**: MIT-licensed, actively maintained, used only for HTML-string parsing (no network calls delegated to it — see decision 3), so a bug in it can produce a bad/empty extraction (→ `'failed'`) but cannot itself make an uncontrolled network request or crash the pipeline (call is inside the per-item try/catch).
- **[Risk] GitHub README fetches count against the GitHub API rate limit alongside the existing Search API calls in `githubTrending.ts`.** → **Mitigation**: unauthenticated GitHub REST API allows 60 req/hour; with `config.news_ingestion.github_token` set (already optional/existing config), the limit rises to 5,000/hour — at this pipeline's per-run volume (a handful of GitHub Trending items surviving relevance filtering), both are comfortably sufficient, and a 403 rate-limit response simply fails that item soft.

## Migration Plan

- **Rollout**: code-only change — new module, pipeline wiring, categorize/chat widening, two new optional `IngestionRun` fields, one new npm dependency. Takes effect on next deploy/restart. `NEWS_CONTENT_FETCH_ENABLED` defaults to `true`; operators wanting to stage the rollout can set it `false` first and flip it on after observing one run's behavior with logging alone (the module still logs routing decisions even when called, if desired) — though the default path is safe to enable immediately given every failure mode is soft.
- **Rollback**: revert the changed files and remove the dependency; no stored-data implications (new `IngestionRun` fields are optional, `NewsItem.content` fields already existed from the prior change).
- **Data**: no migration script. Items already enriched by `news-full-content-sources` are untouched (routing skips them); items this change enriches on future runs simply gain `content` going forward — no backfill of already-stored `none`-status items is performed (consistent with the prior change's no-backfill stance; the ingestion freshness window naturally cycles the working set).

## Open Questions

- Should GitHub READMEs be capped more aggressively than the general 20000-char content cap (`NEWS_CONTENT_MAX_CHARS`, from `news-full-content-sources`), since some READMEs run very long with badges/screenshots-as-markdown that add little semantic value? Left as the same shared cap for this change; revisit only if real ingested data shows README noise crowding out useful signal in categorization or generation.
