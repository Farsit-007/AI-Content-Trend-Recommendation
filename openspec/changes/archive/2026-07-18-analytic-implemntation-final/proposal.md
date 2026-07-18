## Why

Growth Studio's Report dashboard and analytics rollup pipeline currently run on mock data; the one real adapter (`adapters/facebook.ts`) targets `/me/posts` with impression-family metrics that Meta removed on 2026-06-15, so it would 400 or return nulls in production. To make analytics genuinely useful — and to demo real numbers — a team admin must be able to connect a Facebook Page they own and have our 6-hourly refresh pull real Page + linked Instagram Business performance metrics via the official Graph API, safely and within Meta's rate limits.

## What Changes

- Add an official Meta OAuth connect flow (server-side Authorization Code, no JS SDK): a team admin authenticates with Facebook, picks a Page they administer, and the linked Instagram Business account is picked up automatically. Meta's `/me/accounts` list is the ownership proof — no other verification path exists.
- New backend module `MetaOAuth/` exposing connect / callback / list-pages / select-page / disconnect / data-deletion endpoints, with CSRF `state` in Redis, `appsecret_proof` on every Graph call, and `debug_token` validation of scopes and token type.
- Store an encrypted **long-lived Page access token** (+ `ig_user_id`) per team via the existing `PlatformCredential` machinery; **additive, non-breaking** schema fields (`token_type`, `token_expires_at`, `scopes`, `page_id`, `external_name`, `connected_by`).
- **Rewrite `adapters/facebook.ts`** to query `/{page-id}/published_posts` with real engagement (reactions/comments/shares) and the post-June-2026 **views-family** insight metrics (`post_media_view`, `post_media_view_unique`). **BREAKING** to the adapter's internal signature (`(token)` → `(token, accountId)`).
- **New `adapters/instagram.ts`** for IG media + per-media insights (batched), driven off the same Page token.
- Replace the single `ANALYTICS_USE_MOCK_ADAPTERS` boolean with a per-platform allowlist (`ANALYTICS_REAL_PLATFORMS=facebook,instagram`); youtube/linkedin stay mock / non-functional. Pin `GRAPH_API_VERSION=v23.0`.
- Typed Graph error taxonomy (code 190 → `not_connected` with reconnect CTA; 4/17/32 rate-limit handling; `#100` metric drift tolerated) so token death degrades gracefully — never a crash, never silent zeros.
- Frontend: a Platforms settings page (connect / page-picker / connected / needs-reconnect states) and a real Report dashboard replacing the "Coming soon" stub.

## Capabilities

### New Capabilities

- `meta-oauth-connect`: Server-side OAuth connect flow, page-ownership verification, page selection, token persistence, disconnect, and the data-deletion callback for Facebook Pages + linked Instagram Business accounts.
- `social-analytics-ingestion`: Real Graph API adapters (Facebook, Instagram) and the per-platform real/mock selection that feed the existing rollup + RAG pipeline, including the Graph error taxonomy and rate-limit safeguards.
- `platform-connection-ui`: Frontend settings UI for connecting/disconnecting platforms and rendering connection state.
- `analytics-report-dashboard`: Frontend Report dashboard rendering rollups (overview, top posts, best times, format breakdown) and status states.

### Modified Capabilities

<!-- No existing OpenSpec specs under openspec/specs/ to modify; the analytics pipeline changes are captured as new capabilities above. -->

## Impact

- **Backend:** new `MetaOAuth/` module; `routes/index.ts` (register `/oauth/facebook`); `PlatformCredential` model/interface (additive fields); `adapters/facebook.ts` (rewrite), `adapters/instagram.ts` (new), `adapters/index.ts` (allowlist, signature change, drop youtube/linkedin from real map); `analytics.service.ts` (error taxonomy); `config/index.ts` (`ANALYTICS_REAL_PLATFORMS`, `GRAPH_API_VERSION`); new `__tests__`.
- **Frontend:** new `pages/dashboard/settings/Platforms.tsx`, `components/report/*`, `pages/dashboard/Report.tsx` (implement), `lib/api/meta.ts`, `lib/api/analytics.ts`.
- **Config/infra:** `.env` additions (`ANALYTICS_REAL_PLATFORMS`, `GRAPH_API_VERSION`, confirm `FB_CLIENT_ID/SECRET`, `OAUTH_REDIRECT_BASE_URL`); no `docker-compose` changes. Meta app: Facebook Login for Business, redirect URI whitelist, Dev-Mode roles for demo; App Review only for external users.
- **External dependency:** Meta Graph API `v23.0`; Redis for `state`/pending; no new npm packages required beyond existing crypto/fetch.
