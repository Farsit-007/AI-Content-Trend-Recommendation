## Why

"A new AI tool launched today" is one of the strongest content-angle classes for a growth-marketing team, and no current source covers product launches — every existing source is either developer-community engagement (HN, Lobsters, dev.to, GitHub, Stack Overflow) or general trending links (Mastodon, RSS). Product Hunt's official GraphQL API v2 exposes daily top launches with vote/comment engagement for free via OAuth2 client-credentials, closing that gap.

## What Changes

- New adapter `producthunt`: OAuth2 client-credentials token (`POST https://api.producthunt.com/v2/oauth/token`), cached in Redis (`producthunt:app_token`, 24h TTL — mirrors the existing Reddit adapter's token-caching pattern), then a single GraphQL query for the last 24 hours' top-voted posts.
- New optional env vars `PRODUCTHUNT_CLIENT_ID`, `PRODUCTHUNT_CLIENT_SECRET`; unset → the adapter throws `'producthunt not configured (...)'` without any network call (same pattern as the Reddit adapter's unconfigured-credential guard), so the server boots fine and run history shows an honest reason.
- On a GraphQL-endpoint HTTP 401: invalidate the cached token, obtain a fresh one, and retry exactly once (mirrors `reddit.ts`'s `RedditAuthError`/retry-once flow).
- A GraphQL response that returns HTTP 200 but contains an `errors` array (or a missing `data.posts`) is treated as a failure, not a silent empty result — this is a known GraphQL-specific gotcha that a REST-shaped implementation would miss.
- Engagement mapping: `votesCount → raw_points`, `commentsCount → raw_comments`; title is enriched with the product's tagline (`"<name> — <tagline>"`) so a bare product name doesn't starve at the relevance filter.
- **One-time manual prerequisite, not automatable**: an operator must register an application at Product Hunt's developer portal to obtain the client id/secret before this source produces any items — documented in `.env.example`.

**Capabilities:** MODIFIED `news-ingestion` (spec-wise an `ADDED Requirements` entry on the existing capability).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `news-ingestion`: adds the Product Hunt source as a new (`ADDED Requirements`) requirement — OAuth2 client-credentials auth with Redis token caching, one GraphQL query for the last 24h's top launches, the GraphQL-errors-in-200 failure rule, 401-triggered token refresh with a single retry, and an honest "not configured" run-history reason when credentials are absent.

## Impact

- New: `backend/src/app/modules/NewsIngestion/adapters/producthunt.ts`; registry entry `{ source: 'producthunt', fetch: fetchProductHunt }` in `adapters/index.ts`.
- `backend/src/app/config/index.ts` — `PRODUCTHUNT_CLIENT_ID`/`PRODUCTHUNT_CLIENT_SECRET` in `envSchema` (both `z.string().optional()`) and `news_ingestion.producthunt: { client_id, client_secret }`.
- `backend/.env.example` — document both vars plus the one-time app-registration steps.
- Uses the existing `redis` client (`backend/src/app/lib/redis.ts`) for token caching — no new infrastructure.
- New test: `backend/src/__tests__/newsIngestion.producthunt.test.ts` (mock `global.fetch` + `redis`, copy the existing `newsIngestion.reddit.test.ts` style).
- No frontend changes — the `producthunt` label flows into run-history summaries and the Admin UI automatically via the existing `unionSourceKeys` mechanism.
