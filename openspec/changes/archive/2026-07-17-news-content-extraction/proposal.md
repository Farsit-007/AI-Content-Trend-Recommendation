## Why

`news-full-content-sources` captured full text for six sources whose existing API response already carried it, but link-only items — most Hacker News link posts, every Mastodon trending link, GNews articles, dev.to, GitHub Trending repos, and RSS feeds whose entries only summarize — still store nothing beyond a short `snippet` after that change. These are exactly the items the vision's content-generation flow needs real source text for, and they remain the largest share of what this pipeline ingests. Categorization and chat retrieval are also still working from title+snippet alone for these items, when a cheap widening of both would improve category accuracy and answer quality with no architecture change.

## What Changes

- New content-enrichment pipeline layer, run once per ingestion run, after relevance filtering and before categorization (so only items that will actually be stored are fetched — typically 20-60 per run, not every fetched item).
- Two API-based enrichment paths for sources with better options than page-scraping: dev.to (`GET /api/articles/{id}` → `body_markdown`) and GitHub Trending (`GET /repos/{owner/repo}/readme` → decoded raw text).
- A generic readable-article extraction path for every other item still lacking `content` (HN link posts, Mastodon, GNews, thin RSS entries, Lobsters links): fetch the linked page with a timeout, content-type guard, and size limit, then extract the main article text.
- Extraction runs with bounded concurrency and is individually fail-soft per item: a timeout, non-HTML response, oversized body, non-2xx status, or empty extraction result marks that item `content_status: 'failed'` and the item is stored anyway, unchanged otherwise.
- The whole layer is disableable via `NEWS_CONTENT_FETCH_ENABLED` (default enabled) for environments that want zero outbound page fetches.
- Categorization's per-item prompt line gains a short lead from `content` (when present) alongside the existing title/snippet.
- Chat's news-item retrieval context block gains a short `content` excerpt (when present) alongside its existing title/category/snippet/impact fields.
- `IngestionRun`'s per-source counts gain two additive fields, `content_fetched` and `content_failed`, so enrichment health is visible in run history.
- **Non-goals, explicitly out of scope:** live page fetching at *content-generation* time (this is ingestion-time only); widening the embedding input text (`title + snippet` stays exactly as-is); any change to the six sources `news-full-content-sources` already upgraded (they're skipped here — already have content).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: adds a post-relevance-filtering content-enrichment step (dev.to/GitHub APIs + generic article extraction) that fills `content`/`content_status` for items the prior change couldn't reach, widens the categorization prompt to use available content, and adds per-source enrichment counters to persisted ingestion runs (this capability was shipped by `news-ingestion-pipeline` and extended by several since-archived changes plus `news-full-content-sources`; per this repo's established convention for un-synced capabilities — never synced to `openspec/specs/` — this delta restates the full requirement).
- `growth-studio-chat`: the "News-aware retrieval" requirement's context block gains a short content excerpt (when available) alongside the existing title/category/snippet/impact-note fields (this capability was shipped by `ask-growth-studio-chat`; delta restates the full requirement per the same un-synced-capability convention).

## Impact

- `backend/src/app/modules/NewsIngestion/newsIngestion.contentFetch.ts` — new module: routing, dev.to/GitHub fetchers, generic extractor, bounded-concurrency runner.
- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts` — pipeline wiring between relevance filtering and categorization; run-count threading.
- `backend/src/app/modules/NewsIngestion/newsIngestion.categorize.ts` — prompt line widened with a content lead.
- `backend/src/app/modules/Chat/chat.retrieval.ts` — news-item context block widened with a content excerpt.
- `backend/src/app/modules/IngestionRun/ingestionRun.interface.ts`, `ingestionRun.model.ts` — two new optional per-source counters.
- `backend/src/app/config/index.ts` — new `NEWS_CONTENT_FETCH_ENABLED`, `NEWS_CONTENT_FETCH_TIMEOUT_MS`, `NEWS_CONTENT_FETCH_CONCURRENCY` env vars.
- `backend/package.json` — new dependency `@extractus/article-extractor`.
- No database migration — reuses `content`/`content_status`/`word_count`/`content_fetched_at` already added by `news-full-content-sources`.
- No change to embeddings or content-hash identity.
