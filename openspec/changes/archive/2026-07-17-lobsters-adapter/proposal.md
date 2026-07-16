## Why

The pipeline's only high-signal developer-community source is Hacker News. Lobsters (lobste.rs) is the second-best such community: it has an official, stable, unauthenticated JSON API, carries real engagement signals (`score`, `comment_count`) that feed `trend_score`, and costs exactly one HTTP request per run. It is the highest signal-to-noise addition available and requires no credentials or new env vars, so it ships first.

## What Changes

- New adapter `lobsters` fetching `https://lobste.rs/hottest.json` (~25 stories/call, quality-ranked, not the unmoderated `newest.json` firehose) and normalizing each story to `RawNewsItem`.
- Engagement mapping: `score → raw_points`, `comment_count → raw_comments`, `raw_stars_delta: 0`.
- Text posts (empty `url` field) use the story's `comments_url` as the item URL.
- Story `tags` are appended to the snippet as plain words when the story has no `description`, for extra relevance-filter signal.
- Shared HTML-text helper `adapters/htmlText.ts` extracted from the entity-decode + tag-strip logic currently private inside `githubTrending.ts`, reused here for Lobsters' HTML `description` field. `githubTrending.ts` is refactored to import the extracted helpers with no behavior change.
- Registers `{ source: 'lobsters', fetch: fetchLobsters }` in the adapter registry — run-history observability (summaries, `IngestionRun` docs, zero-streak alerting, Admin UI) picks up the new source label automatically via `unionSourceKeys`, no further plumbing needed.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: adds the Lobsters source as a new (`ADDED Requirements`) requirement on the existing news-ingestion capability — fetch hottest stories, map engagement, fall back to `comments_url` for text posts, and surface endpoint failures in run history.

## Impact

- New: `backend/src/app/modules/NewsIngestion/adapters/lobsters.ts`, `backend/src/app/modules/NewsIngestion/adapters/htmlText.ts`.
- `backend/src/app/modules/NewsIngestion/adapters/index.ts` — register `{ source: 'lobsters', fetch: fetchLobsters }`.
- `backend/src/app/modules/NewsIngestion/adapters/githubTrending.ts` — import the extracted `htmlText.ts` helpers (no behavior change; guarded by its existing test).
- New test: `backend/src/__tests__/newsIngestion.lobsters.test.ts`.
- No config, env var, or frontend changes.
