## Why

Every current source is either news/launches (HN, Lobsters, dev.to, GitHub, Product Hunt, RSS) or cross-site trending links (Mastodon) — none of them carry "what developers are actually struggling with today," a distinct content-idea signal a growth-marketing team can act on directly (tutorial ideas, pain-point-driven posts). The Stack Exchange API's hot-questions endpoint is official, keyless (300 req/day per IP, and this pipeline needs 8), and carries real engagement (`score`, `answer_count`).

## What Changes

- New adapter `stackoverflow`: `GET https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=25`, appending `&key=<STACKEXCHANGE_KEY>` only when the optional key is configured.
- New optional env var `STACKEXCHANGE_KEY` — raises the unauthenticated quota from 300/day to 10k/day; the adapter is fully functional without it at this pipeline's call volume (8 requests/day).
- Field mapping: `question_id → source_id` (stringified), `link → url`, entity-decoded `title` (the Stack Exchange API HTML-encodes titles, e.g. `&quot;`/`&#39;`) via the existing `htmlText.ts` helper, `tags.join(', ') → snippet` (tag lists are compact, high-signal embedding text; full question bodies aren't in the default response filter and would cost extra quota + noise), `creation_date` (epoch seconds) `→ published_at`, `score → raw_points`, `answer_count → raw_comments`.
- An API-level error response (Stack Exchange returns `error_id`/`error_message` JSON, sometimes with a non-200 status) is treated as an adapter failure, not a silent empty result.
- The API's optional `backoff` field (a "slow down" hint) is logged as a warning, never slept on — at 8 requests/day it will essentially never fire, and an adapter must never sleep-loop.

**Capabilities:** MODIFIED `news-ingestion` (spec-wise an `ADDED Requirements` entry on the existing capability).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: adds the Stack Overflow hot-questions source as a new (`ADDED Requirements`) requirement — keyless-by-default fetch with optional quota-raising key, entity-decoded titles, tag-list snippets, and API-error detection.

## Impact

- New: `backend/src/app/modules/NewsIngestion/adapters/stackoverflow.ts`; registry entry `{ source: 'stackoverflow', fetch: fetchStackOverflow }` in `adapters/index.ts`.
- `backend/src/app/config/index.ts` — `STACKEXCHANGE_KEY` in `envSchema` (`z.string().optional()`) and `news_ingestion.stackexchange_key`.
- `backend/.env.example` — document the var (optional quota raise, where to obtain a key).
- Reuses the existing `decodeEntities` helper from `adapters/htmlText.ts` (introduced by the `lobsters-adapter` change) — no new HTML-handling code.
- New test: `backend/src/__tests__/newsIngestion.stackoverflow.test.ts`.
- No frontend changes — the `stackoverflow` label flows into run-history summaries and the Admin UI automatically via the existing `unionSourceKeys` mechanism.
