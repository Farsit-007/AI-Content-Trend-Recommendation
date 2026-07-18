## Context

Growth Studio's analytics pipeline (`analytics.service.ts` → `AnalyticsRollup` → `/reports` → RAG `embedNewPosts`) runs on mock data. The only real adapter, `adapters/facebook.ts`, targets `/me/posts` with `post_impressions`/`post_engaged_users` — impression-family metrics Meta removed on 2026-06-15 — so it would 400 or return nulls in production. There is no OAuth path: `PlatformCredential` stores a token per team+platform, but nothing mints a real Facebook Page token. `config.analytics.use_mock_adapters` is a single global boolean, and `getAdapter` calls real adapters with only `(token)`.

We are implementing **Option A** from the feasibility report: official Meta OAuth, **Facebook Pages + linked Instagram Business only**. Meta's model is the key constraint: one shared Meta app; *users* (not pages) log in; Meta's `/me/accounts` list is the only ownership proof; the token chain is short-lived user → long-lived user → **long-lived Page token** (no scheduled expiry, dies on revocation → Graph error 190). Dev Mode gives full-permission real data for app role-holders with zero App Review — the demo path.

## Goals / Non-Goals

**Goals:**

- A team admin connects a Facebook Page via official OAuth; the linked IG Business account is picked up automatically; the 6-hourly refresh pulls real metrics into the existing rollup + RAG pipeline unchanged.
- Additive, non-breaking `PlatformCredential` extension; existing rows and `getPlatformToken()` untouched.
- Selective real adapters (FB/IG real; others mock) with the test suite still all-mock.
- Token death and rate limits degrade to typed states — never a crash, never silent zeros.
- Zero non-official API calls; all usage within Meta rate limits, verified via usage headers.

**Non-Goals:**

- YouTube / LinkedIn / X / TikTok real adapters (stay mock / `pending_approval`).
- Publishing/posting to FB/IG (different permissions + review).
- Ads/paid metrics (Marketing API).
- Silent token refresh — a dead Page token requires the user to redo the OAuth flow (first-class UI state).

## Decisions

**1. Server-side Authorization Code flow, no JS SDK.** Backend builds the `dialog/oauth` URL and handles the callback. *Why over the JS SDK:* the Page token never touches the browser, CSRF `state` carries `teamId` through the round-trip without trusting the client, and `appsecret_proof` + "Require App Secret" makes an exfiltrated token unusable off our server. Alternative (client-side SDK) rejected: tokens exposed to the browser, weaker server-side proof.

**2. `state` and pending candidates in Redis, not the DB.** `oauth:fb:{state}` (10 min) is single-use CSRF defense; `oauth:fb:pending:{teamId}` (15 min) holds encrypted page candidates between callback and selection. *Why:* short-lived, self-expiring, no schema churn, no permanent storage of tokens for pages the user won't pick. Only the chosen page's token is persisted.

**3. Reuse `PlatformCredential` with additive fields.** New optional fields `token_type`, `token_expires_at`, `scopes`, `page_id`, `external_name`, `connected_by`; `account_id` holds page id (FB row) / `ig_user_id` (IG row). IG row reuses the **same** encrypted Page token. *Why over a new model:* `getPlatformToken()`, encryption (`crypto.ts`, `select:false`), and the per-team+platform unique index all work as-is; existing rows stay valid because every new field is optional.

**4. Views-family metrics, verified in Graph API Explorer first.** FB adapter → `/{page_id}/published_posts` with `post_media_view`/`post_media_view_unique`; IG adapter → `/{ig_user_id}/media` + batched per-media `views,reach,saved`. Phase 1 confirms exact metric names against the live page before any code depends on them. *Why:* the June-2026 migration is recent; hardcoding tutorial-era names is exactly the current bug. `#100 metric not supported` is tolerated (zero that metric, keep engagement).

**5. Allowlist replaces the boolean.** `getAdapter` resolves real only when `use_mock_adapters=false` AND `platform ∈ ANALYTICS_REAL_PLATFORMS`. Real-adapter signature becomes `(token, accountId)`; `AdapterFn` passes `credential.account_id` through. `youtube`/`linkedin` dropped from the real map. *Why:* one flag flips the whole demo; tests keep `use_mock_adapters=true`; deferred platforms are explicitly non-functional rather than silently broken.

**6. Typed `GraphApiError` + error taxonomy in `metaOAuth.graph.ts`.** Parse the `{ error: { code, subcode, message, type } }` envelope once; `runAnalyticsRefresh` branches on code (190 → `not_connected` + flag credential; 10/200–299 → `not_connected`; 4/>90% usage → abort run; 17/32 → skip platform; 1/2 → one 5s retry). *Why:* centralizes Meta's quirks, keeps the refresh loop resilient, and makes reconnect a first-class UI state.

**7. Graph version pinned in one constant.** `GRAPH_API_VERSION=v23.0`; every call reads it. *Why:* single upgrade point; never call unversioned endpoints (each version lives ~2 years).

## Risks / Trade-offs

- **Metric names drift again (Meta changes fields) → 400/nulls.** → Pin version, verify in Explorer in Phase 1, tolerate `#100` per-metric, subscribe to the changelog.
- **Dev Mode user cap (only app role-holders can connect).** → Acceptable for demo; App Review (time, not money) is the only gate for external users and can run in parallel.
- **Page token dies silently (revocation, password change) → stale data.** → Code 190 handling marks `not_connected`, flags the credential, and the UI shows reconnect; refresh never crashes.
- **Same Page token stored on two rows (FB + IG) → double revocation surface.** → Disconnect revokes on Meta's side and deletes both rows atomically; encryption + `appsecret_proof` limit blast radius.
- **Rate limits scale with active users.** → Budget is ~1.7 calls/team/hour (3+ orders under ceiling); pace + batch IG insights; abort at >90% `X-App-Usage`.
- **Data-deletion / privacy compliance required for Live Mode.** → Implement the signed-request callback + privacy page now even though Dev Mode doesn't strictly require them, so App Review isn't blocked later.

## Migration Plan

- **Phase 1 (½ day, no code):** create the Meta app, add teammates as Testers, set redirect URI, and confirm the exact adapter queries + metric names in Graph API Explorer against a real demo Page/IG account.
- **Phase 2 (2–3 days):** backend `MetaOAuth` module, schema extension, `metaOAuth.graph.ts`, both adapters, allowlist config, error taxonomy; verify connect flow locally then `POST /analytics/refresh` yields `status:'ok'` real numbers; kill-switch test (revoke app → `not_connected`, no crash); integration tests green; `npm run build` clean.
- **Phase 3 (2 days):** Platforms settings page + page picker; Report dashboard components; E2E happy path + edge states at 375px/dark mode.
- **Phase 4 (parallel, weeks):** business verification, privacy policy, data-deletion endpoint live, App Review submission. Stay in Dev Mode for the demo regardless.
- **Rollback:** `ANALYTICS_USE_MOCK_ADAPTERS=true` (or empty `ANALYTICS_REAL_PLATFORMS`) reverts to all-mock instantly; additive schema fields need no data migration to roll back.

## Open Questions

- Exact post-June-2026 metric names per media type must be confirmed in Phase 1 (`post_media_view` vs any page-level equivalent; IG reel-specific `shares`).
- Whether `business_management` scope is needed for Business-Manager-owned Pages that don't appear in `/me/accounts` — add only if Phase 1 shows an empty list for such a page.
- Whether to retain the long-lived **user** token to re-mint page tokens without re-login, or store only the page token (default: store only the page token).
