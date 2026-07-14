## Why

Growth Studio's backend is ~75–80% complete but is missing the Analytics and Report modules entirely — the two "never cut" requirements (FR-06, FR-09..12) that make the platform's core value proposition (cross-platform performance intelligence) demonstrable at the 2026-07-18 demo. With ~3 days left, this change delivers the remaining backend scope in priority order: analytics data pipeline first, report API second, then caching and badge improvements.

## What Changes

- **New `Analytics` module** — fetches 30-day FB/YouTube data per team × enabled platform, populates `platform_posts` and `platform_analytics` rollup documents, runs on a 6-hour cron, and exposes admin refresh + status endpoints. Credentials are resolved exclusively from each team's own encrypted `PlatformCredential` records (added via the frontend) — no `.env` bootstrap fallback. Teams without credentials for a platform get `status: 'not_connected'`. Includes `ANALYTICS_USE_MOCK_ADAPTERS` mode and an idempotent `seed:demo-analytics` script for demo data.
- **New `Report` module** — stateless, Redis-cached endpoint that aggregates 30-day performance overview, per-platform breakdowns, opportunity ranking (top-5 news × audience match), and a Banglish AI narrative insight; degrades gracefully (no 502s) when LLM is unavailable; warms in under 15 seconds cold.
- **Content generation Redis cache** (FR-20) — 24-hour `content:{team_id}:{item_id}` cache around the LLM call in the existing `ContentGeneration` service.
- **High-opportunity badge** (FR-24) — optional `team_id` param on `GET /news-items` that annotates each item with `high_opportunity` via audience-match scoring; threshold fallback (`opportunity_score >= 7.5`) if time runs out.
- **Admin analytics refresh trigger** (FR-26) — `POST /analytics/refresh` endpoint, admin-only, triggers on-demand job.
- Cron wiring in `lib/scheduler.ts`, env vars in `config/index.ts`, route registration in `routes/index.ts`, Swagger docs updated.

## Capabilities

### New Capabilities
- `platform-analytics`: Analytics data pipeline — platform adapters (Facebook, YouTube, mock), rollup computation, 6h cron, admin refresh trigger, demo seed script
- `cross-platform-report`: Cross-platform 30-day report API — aggregation, opportunity ranking, Banglish AI insight, Redis 6h cache, graceful LLM degradation
- `content-generation-cache`: 24h Redis cache for generated content to protect OpenRouter quota (FR-20)
- `opportunity-badge`: Team-aware high-opportunity annotation on news items via audience-match scoring (FR-24)

### Modified Capabilities
<!-- No existing specs to modify — all new capabilities -->

## Impact

- **New files:** `backend/src/app/modules/Analytics/` (model, adapters, rollup, service, controller, route, validation), `backend/src/app/modules/Report/` (aggregate, opportunities, prompt, service, controller, route), `backend/scripts/seedDemoAnalytics.ts`
- **Modified files:** `backend/src/app/routes/index.ts` (register new routes), `backend/src/lib/scheduler.ts` (analytics cron), `backend/src/config/index.ts` (new env vars), `backend/src/app/modules/ContentGeneration/contentGeneration.service.ts` (add Redis cache), `backend/src/app/modules/NewsItem/newsItem.service.ts` (add `high_opportunity` annotation)
- **Modified files (additional):** `backend/src/lib/platformCredentials.ts` — remove `.env` bootstrap fallback; resolve team credentials from DB only
- **Dependencies:** `lib/embeddings.ts`, `lib/similarity.ts`, `lib/redisClient.ts` — reused without modification
- **APIs added:** `POST /analytics/refresh`, `GET /analytics`, `GET /reports`
- **Breaking changes:** None — all new endpoints; existing endpoints unchanged
