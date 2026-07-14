## 1. Analytics — Data Model & Config

- [x] 1.1 Add `ANALYTICS_USE_MOCK_ADAPTERS`, `ANALYTICS_REFRESH_CRON`, `REPORT_CACHE_TTL_SECONDS` to `backend/src/config/index.ts` with defaults
- [x] 1.0 Update `backend/src/lib/platformCredentials.ts` — remove `.env` bootstrap fallback; resolve token from team's `PlatformCredential` DB record only; return `null` (not throw) when no record found so callers can set `status: 'not_connected'`
- [x] 1.2 Create `backend/src/app/modules/Analytics/analytics.model.ts` — `platform_analytics` Mongoose schema (`team_id`, `platform`, `status`, `period`, `overview`, `top_posts[]`, `best_times[]`, `content_breakdown[]`, `fetched_at`); unique index on `(team_id, platform)`
- [x] 1.3 Create `backend/src/app/modules/Analytics/analytics.interface.ts` — TypeScript interfaces for rollup document and adapter return types

## 2. Analytics — Platform Adapters

- [x] 2.1 Create `backend/src/app/modules/Analytics/adapters/mock.ts` — deterministic 30-day posts seeded on `team_id + platform`, realistic engagement numbers, topics aligned with news categories
- [x] 2.2 Create `backend/src/app/modules/Analytics/adapters/facebook.ts` — Meta Graph API adapter (token-gated; wraps in try/catch)
- [x] 2.3 Create `backend/src/app/modules/Analytics/adapters/youtube.ts` — YouTube Data API v3 adapter (token-gated; wraps in try/catch)
- [x] 2.4 Create `backend/src/app/modules/Analytics/adapters/linkedin.ts` — returns `{ status: 'pending_approval', posts: [] }` without any API call
- [x] 2.5 Create `backend/src/app/modules/Analytics/adapters/index.ts` — registry that returns mock or real adapter based on `ANALYTICS_USE_MOCK_ADAPTERS` flag

## 3. Analytics — Rollup & Service

- [x] 3.1 Create `backend/src/app/modules/Analytics/analytics.rollup.ts` — pure function `computeRollup(posts[]): AnalyticsRollup` (overview stats, top_posts, best_times, content_breakdown)
- [x] 3.2 Create `backend/src/app/modules/Analytics/analytics.service.ts` — `runAnalyticsRefresh(filter?)`: iterate teams × enabled platforms → resolve token from team's DB credential (null → write `status: 'not_connected'` rollup, skip) → adapter fetch → embed only unseen posts → bulk upsert `platform_posts` → compute rollup → upsert `platform_analytics` → invalidate `report:{team_id}` in Redis
- [x] 3.3 Wire analytics cron in `backend/src/lib/scheduler.ts` using `ANALYTICS_REFRESH_CRON` env var (default `0 */6 * * *`)

## 4. Analytics — Routes & Wiring

- [x] 4.1 Create `backend/src/app/modules/Analytics/analytics.validation.ts` — Zod schemas for request params
- [x] 4.2 Create `backend/src/app/modules/Analytics/analytics.controller.ts` — handlers for `POST /analytics/refresh` (admin) and `GET /analytics` (team member)
- [x] 4.3 Create `backend/src/app/modules/Analytics/analytics.route.ts` — route definitions with auth middleware
- [x] 4.4 Register analytics routes in `backend/src/app/routes/index.ts`
- [x] 4.5 Start analytics cron in `backend/src/server.ts`

## 5. Analytics — Demo Seed Script

- [x] 5.1 Create `backend/scripts/seedDemoAnalytics.ts` — idempotent seed: generate mock posts for all teams × platforms, embed only new posts (batch with delay), compute and upsert rollups
- [x] 5.2 Add `"seed:demo-analytics": "ts-node scripts/seedDemoAnalytics.ts"` to `backend/package.json` scripts

## 6. Report — Core Logic

- [x] 6.1 Create `backend/src/app/modules/Report/report.aggregate.ts` — pure function: 30-day overview + delta vs prior 30 days from `platform_posts`; per-platform sections from `platform_analytics` rollups
- [x] 6.2 Create `backend/src/app/modules/Report/report.opportunities.ts` — `computeAudienceMatch(newsEmbedding, teamPostEmbeddings[])` pure function; `getTopOpportunities(teamId, newsItems[])` returns top-5 with `suggested_platform` and `suggested_format`
- [x] 6.3 Create `backend/src/app/modules/Report/report.prompt.ts` — builds Banglish insight prompt from precomputed numbers; single LLM call via `lib/llm.ts`
- [x] 6.4 Create `backend/src/app/modules/Report/report.service.ts` — `assertTeamAccess` → check Redis `report:{team_id}` → if miss: aggregate + opportunities + LLM call → SETEX 6h → return; LLM failure → `ai_insight: null`, no 502

## 7. Report — Routes & Wiring

- [x] 7.1 Create `backend/src/app/modules/Report/report.validation.ts` — Zod schemas for `team_id` and `refresh` params
- [x] 7.2 Create `backend/src/app/modules/Report/report.controller.ts` — handler for `GET /reports`; admin bypass via `refresh=true`
- [x] 7.3 Create `backend/src/app/modules/Report/report.route.ts` — route definition with auth middleware
- [x] 7.4 Register report routes in `backend/src/app/routes/index.ts`

## 8. Content Generation Cache (FR-20)

- [x] 8.1 Add Redis cache check at the top of the LLM call in `backend/src/app/modules/ContentGeneration/contentGeneration.service.ts`: key `content:{team_id}:{news_item_id ?? sha256(topic)}`, read before LLM, write after success, 24h TTL
- [x] 8.2 Add `crypto` import for `sha256(topic)` key generation (Node.js built-in, no new dependency)

## 9. High-Opportunity Badge (FR-24)

- [x] 9.1 Add optional `team_id` query param to `GET /news-items` Zod validation in `backend/src/app/modules/NewsItem/newsItem.validation.ts`
- [x] 9.2 In `backend/src/app/modules/NewsItem/newsItem.service.ts`: when `team_id` present, load team post embeddings (Redis cache `team_embeddings:{team_id}`, 6h TTL), call `computeAudienceMatch` from `report.opportunities.ts`, annotate each item with `high_opportunity: boolean`; fallback to `opportunity_score >= 7.5` when no embeddings exist

## 10. Verification

- [x] 10.1 Run `npm run typecheck` in `backend/` — zero errors
- [ ] 10.2 Run `npm run seed:demo-analytics` — completes without errors (requires live DB + OpenRouter)
- [ ] 10.3 `POST /analytics/refresh` → verify returns `{ success: true }` and rollups exist in DB
- [ ] 10.4 `GET /reports?team_id=<id>` cold → verify response in under 15s with all fields including `ai_insight`
- [ ] 10.5 `GET /reports?team_id=<id>` warm (second call) → verify response under 100ms from Redis cache
- [ ] 10.6 `GET /news-items?team_id=<id>` → verify `high_opportunity` field present on items
- [ ] 10.7 Verify Swagger UI at `/api/v1/docs` shows new endpoints (`/analytics`, `/reports`)
- [x] 10.8 Run existing integration tests (`npm test`) — all 31 pass, no regressions
