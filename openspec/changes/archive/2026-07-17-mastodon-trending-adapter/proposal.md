## Why

Every current source measures engagement *inside* one community (HN votes, dev.to reactions, GitHub stars). Mastodon's public trending-links endpoint measures what articles people are actively sharing right now *across* the fediverse — a real-time, cross-site trend signal none of the existing sources carry — with no authentication required. The shared URLs are external articles, so they also enrich cross-source dedup: the same story arriving from HN, an RSS feed, and Mastodon collapses via semantic dedup into a single item, keeping the highest-engagement copy.

## What Changes

- New adapter `mastodon` fetching `https://<instance>/api/v1/trends/links` from each instance configured in `NEWS_INGESTION_MASTODON_INSTANCES`.
- New optional env var `NEWS_INGESTION_MASTODON_INSTANCES` (comma-separated hostnames, default `mastodon.social,fosstodon.org`) — default-enabled since no credentials are needed; setting it to an empty value disables the adapter, which throws a `"mastodon not configured (…)"` error (reddit's unconfigured-credential pattern) so run history shows an honest reason instead of a silent empty success.
- Cross-instance merge deduplicated by link URL, keeping the copy with the higher sharer count.
- Engagement mapping: `history[0].accounts` (distinct sharers, arrives as a **string** from the API — coerced with `Number()`) → `raw_points`; `history[0].uses` (total shares, correlated and more gameable) is ignored.
- `published_at` set to fetch time — trending links carry no publication date, and leaving it `undefined` would bypass freshness filtering entirely and exclude these items from the semantic-dedup recent pool.
- Per-instance failure isolation (`Promise.allSettled`): one instance being down doesn't prevent the others from contributing; the adapter throws only when every configured instance failed.

**Capabilities:** MODIFIED `news-ingestion` (spec-wise an `ADDED Requirements` entry on the existing capability).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: adds the Mastodon trending-links source as a new (`ADDED Requirements`) requirement on the existing news-ingestion capability — per-instance fetch, cross-instance URL-keyed merge, string-to-number engagement coercion, fetch-time `published_at`, and configuration-driven enable/disable with an honest "not configured" run-history reason.

## Impact

- New: `backend/src/app/modules/NewsIngestion/adapters/mastodon.ts`.
- `backend/src/app/modules/NewsIngestion/adapters/index.ts` — register `{ source: 'mastodon', fetch: fetchMastodon }`.
- `backend/src/app/config/index.ts` — `NEWS_INGESTION_MASTODON_INSTANCES` in `envSchema` (`z.string().default('mastodon.social,fosstodon.org')`) and the parsed array `news_ingestion.mastodon_instances` (split/trim/filter, mirroring `rss_feeds`).
- `backend/.env.example` — document the new var (default, how to disable, no credentials needed).
- New test: `backend/src/__tests__/newsIngestion.mastodon.test.ts`.
- No frontend changes — the Admin UI's run-history view and source-health alerting pick up the `mastodon` label automatically via `unionSourceKeys`.
