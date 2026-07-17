## Why

`POST /content/generate` and the categorization LLM are asked to write real, useful output — Bangla social posts, category judgments, chat answers — from almost nothing: `NewsItem` stores only a short `snippet` (Stack Overflow stores a bare tag list, Product Hunt only a ~60-character tagline, Reddit truncates at 500 characters), and no adapter fetches the linked page. This is the direct cause of the hallucination risk already flagged in `content-generation-news-grounding` and blocks the product vision of storing "the description and all the parts of the content" of every ingested resource. Several sources already return fuller text in the exact same API response the adapters call today (Reddit's full `selftext`, Stack Exchange's question body one query-param away, Product Hunt's `description` field, RSS's `content:encoded`) — today it is fetched and thrown away. This change captures that free text first, before any new network calls are introduced (a separate follow-up change adds page-extraction for link-only sources).

## What Changes

- `NewsItem` (and the adapter-facing `RawNewsItem`) gain a `content` field holding the fullest available text, separate from the short `snippet`, plus `content_status` (`none|partial|full|failed`), `word_count`, and `content_fetched_at`.
- Six adapters are upgraded to populate `content` from data their existing single request already returns or one additional parameter unlocks, with **zero change to `snippet`**: Reddit (full `selftext`), Stack Overflow (`filter=withbody` query param → question body), Product Hunt (`description` added to the existing GraphQL query), Lobsters (uncapped description), RSS (`content:encoded` via `rss-parser` custom fields), Hacker News (full stripped `story_text` for text posts).
- A new `NEWS_CONTENT_MAX_CHARS` setting (default 20000) is applied once, centrally, in the pipeline's payload-assembly step, setting `content_status` to `partial` when truncation occurred and `full` otherwise.
- `GET /news-items` (list) stops returning the raw `embedding` vector and the new `content` field in each item, to keep list responses light; `GET /news-items/:id` keeps `content` but also drops `embedding`.
- Manual news-item create/update (admin API) accepts the three new optional fields; OpenAPI docs are updated to match.
- **Non-goals, explicitly out of scope for this change:** live page fetching for link-only items (Mastodon, GNews, HN link posts, dev.to, GitHub repos) — a separate follow-up change (`news-content-extraction`); any change to the embedding input text (`title + snippet` stays exactly as-is, since the semantic-dedup threshold is calibrated against it); any change to content-hash identity; any backfill of existing rows.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: adds full-content capture from source APIs (`content`/`content_status`/`word_count`/`content_fetched_at` on every stored `NewsItem`) for the six sources whose existing request already carries or nearly carries fuller text, and adds response-payload hygiene to the news-item list/detail endpoints (this capability was shipped by `news-ingestion-pipeline` and extended by several since-archived changes; per this repo's established convention for un-synced capabilities — never synced to `openspec/specs/` — this delta restates the full requirement).

## Impact

- `backend/src/app/modules/NewsItem/newsItem.interface.ts`, `newsItem.model.ts` — new fields on `INewsItem`.
- `backend/src/app/modules/NewsIngestion/newsIngestion.interface.ts` — `RawNewsItem` gains `content?: string`.
- `backend/src/app/modules/NewsIngestion/adapters/{reddit,stackoverflow,producthunt,lobsters,rss,hackerNews}.ts` — populate `content`.
- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts` — payload assembly applies the cap/status/word-count logic.
- `backend/src/app/config/index.ts` — new `NEWS_CONTENT_MAX_CHARS` env var.
- `backend/src/app/modules/NewsItem/newsItem.service.ts` — list/detail responses strip `embedding` (and list strips `content`).
- `backend/src/app/modules/NewsItem/newsItem.validation.ts`, `backend/src/app/docs/schemas.ts` — new optional fields.
- No database migration — all new fields are optional; existing rows read as `content_status: 'none'` via schema default.
- No change to embeddings, content-hash identity, or the semantic-dedup threshold.
