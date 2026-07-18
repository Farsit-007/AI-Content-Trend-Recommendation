## 1. Meta app + Phase-1 verification (no code) — ⚠️ MANUAL (Meta developer portal; cannot be automated)

- [ ] 1.1 Create the Meta app (Business type), add Facebook Login for Business (Web), set the dev redirect URI `http://localhost:5000/api/v1/oauth/facebook/callback`, App Domains `localhost`
- [ ] 1.2 Add teammates as Developer/Tester roles; create a real demo Page + linked IG Professional account with a few posts/reels
- [ ] 1.3 In Graph API Explorer, get a user token with the 6 scopes → `/me/accounts` → grab a Page token; confirm exact metric names (`post_media_view`, `post_media_view_unique`, IG `views,reach,saved`) against the demo page
- [ ] 1.4 Record `FB_CLIENT_ID`/`FB_CLIENT_SECRET`; enable App Dashboard → Advanced → Require App Secret

## 2. Config & environment

- [x] 2.1 Add `ANALYTICS_REAL_PLATFORMS` (default `''`, parsed to array under `config.analytics.real_platforms`) and `GRAPH_API_VERSION` (default `v23.0`) to `config/index.ts`
- [x] 2.2 Confirm `FB_CLIENT_ID`, `FB_CLIENT_SECRET`, `OAUTH_REDIRECT_BASE_URL=http://localhost:5000/api/v1` in `.env` and config schema; add `.env.example` entries

## 3. PlatformCredential schema extension (additive)

- [x] 3.1 Add optional fields to `platformCredential.model.ts`: `token_type` (enum page/user/api_key, default api_key), `token_expires_at`, `scopes[]`, `page_id`, `external_name`, `connected_by`
- [x] 3.2 Mirror the new fields in `platformCredential.interface.ts`; verify existing rows and `getPlatformToken()` are untouched

## 4. Graph fetch wrapper

- [x] 4.1 Create `MetaOAuth/metaOAuth.graph.ts`: typed `graphGet(path, params, token)` pinning `GRAPH_API_VERSION`, appending `appsecret_proof`, parsing the `{ error: {...} }` envelope into a typed `GraphApiError`
- [x] 4.2 Read `X-App-Usage` / `X-Business-Use-Case-Usage`; log warning at >75%, expose >90% for the abort path

## 5. MetaOAuth module

- [x] 5.1 Scaffold `MetaOAuth/` (route/controller/service/validation) following the module pattern with `catchAsync`/`sendResponse`; register `{ path: '/oauth/facebook', route: MetaOAuthRoutes }` in `routes/index.ts`
- [x] 5.2 `GET /oauth/facebook/connect` (auth + team-admin): create `state` in Redis (10 min), return `{ url }` with scopes + exact redirect_uri
- [x] 5.3 `GET /oauth/facebook/callback` (unauthenticated): validate+consume `state`; exchange code → short-lived → long-lived user token; `debug_token` scope check; `/me/accounts` ownership list; store encrypted pending candidates in Redis (15 min); redirect to `/dashboard/settings/platforms?fb=pick`; handle `missing_permissions` / `no_pages` redirects
- [x] 5.4 `GET /oauth/facebook/pages` (auth + team-admin): return pending candidates without tokens
- [x] 5.5 `POST /oauth/facebook/select-page` (auth + team-admin): `debug_token` the page token (type PAGE, profile_id match); upsert encrypted `facebook` + optional `instagram` credentials; enable `TeamPlatform` rows; delete pending key; trigger `runAnalyticsRefresh({ teamId })`
- [x] 5.6 `DELETE /oauth/facebook` (auth + team-admin): revoke on Meta side, delete both credential rows, upsert `not_connected` rollups
- [x] 5.7 `POST /oauth/facebook/data-deletion` (signed-request): verify HMAC signature, delete credentials for that Meta user, respond `{ url, confirmation_code }`
- [x] 5.8 `metaOAuth.validation.ts`: zod for callback query and select-page body

## 6. Analytics adapters

- [x] 6.1 Rewrite `adapters/facebook.ts` to `(token, accountId)`: `/{page_id}/published_posts` with reactions/comments/shares summaries, attachment media type, `post_media_view`/`post_media_view_unique`; follow `paging.next` ≤4 pages; map to `IAdapterPost.metrics`; tolerate `#100` per-metric
- [x] 6.2 Create `adapters/instagram.ts` `(token, accountId)`: `/{ig_user_id}/media` (30d) + batched per-media insights (`views,reach,saved`, reel `shares`); map fields; skip `STORY`
- [x] 6.3 Update `adapters/index.ts`: change `AdapterFn` to pass `accountId`; allowlist logic (`use_mock_adapters=false` AND platform in `real_platforms`); register `instagram`; remove `youtube`/`linkedin` from the real map
- [x] 6.4 Wire `credential.account_id` through `runAnalyticsRefresh` into the adapter call

## 7. Error taxonomy in refresh

- [x] 7.1 In `analytics.service.ts` `runAnalyticsRefresh`, catch `GraphApiError` and branch: 190 → `not_connected` + set `token_expires_at:now`; 10/200–299 → `not_connected`; 4 or >90% usage → abort run; 17/32 → skip platform `status:'error'`; 1/2 → one 5s retry then `error`
- [x] 7.2 Expose `is_mock` on the rollup response (one-line addition) for the frontend badge

## 8. Backend tests

- [x] 8.1 `metaOAuth.integration.test.ts`: mocked `fetch`; bad/expired/reused state → redirect; missing-scope + no_pages redirects; select-page persists encrypted rows; disconnect revokes + forbids outsider
- [x] 8.2 `analytics.facebook.adapter.test.ts`: fixture Graph responses incl. a 190 error and a `#100` partial → assert mapping + error taxonomy
- [x] 8.3 Confirm existing suites stay green (55/55 pass, `NODE_ENV=test` keeps all-mock); `npm run build` clean

## 9. Frontend — API clients & Platforms settings

- [x] 9.1 `lib/api/meta.ts`: `getFacebookConnectUrl`, `listPendingPages`, `selectPage`, `disconnectFacebook` (+ `listTeamCredentials`); `lib/api/analytics.ts`: `getAnalytics`, `getReport`
- [x] 9.2 `pages/dashboard/settings/Platforms.tsx` wired into role-based routes; Facebook card states: not-connected (CTA + prerequisites), picking (popup → page-picker modal → select), connected (name/avatar/IG badge/disconnect), needs-reconnect (amber banner)
- [x] 9.3 Render YouTube/LinkedIn/X/TikTok as disabled "Coming soon"

## 10. Frontend — Report dashboard

- [x] 10.1 Implement `pages/dashboard/Report.tsx` with react-query over `/analytics` + `/reports`; platform tabs from available rollups
- [x] 10.2 `components/report/*`: overview stat cards, top-posts table (card collapse <640px), best-times heatmap, format breakdown — using design tokens (`glass-card`, `gradient-text`, amber/emerald)
- [x] 10.3 Status states: `not_connected` CTA → settings, `pending_approval` banner, `error` retry + `fetched_at`, loading skeletons, "Demo data" badge on `is_mock`
- [x] 10.4 Built responsive (mobile-first, sm: table→cards, dark-mode tokens); `npm run build` clean. Live 375px visual pass deferred to manual E2E (11.3)

## 11. End-to-end verification — ⚠️ MANUAL (needs the Meta app from group 1 + a real browser/FB account)

- [ ] 11.1 Local connect flow: browser → connect → pick demo page → `POST /api/v1/analytics/refresh` → `analytics_rollups` shows `status:'ok'` with real numbers
- [ ] 11.2 Kill-switch: revoke app from facebook.com → next refresh yields `not_connected`, no crash; UI shows reconnect
- [ ] 11.3 E2E happy path + edge states (no pages, missing scopes, expired token, mock platforms) rendered correctly
