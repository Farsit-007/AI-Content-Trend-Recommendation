# Backend Report & Remaining Work Plan — Growth Studio

> Generated 2026-07-14 · 4 days to demo (2026-07-18)
> Sources: code audit of `backend/src/`, `project-ida-requirments.md`, `MASTER-PLAN.md`, `README.md`, archived OpenSpec changes.

---

## TL;DR

| Question | Answer |
|---|---|
| Is RAG implemented? | **Yes — fully implemented, tested, live-verified.** 3 active RAG pipelines. |
| Backend progress | **~75–80%** of required backend scope is done and solid. |
| Main gap | **Analytics module + Report module do not exist** (FR-06, FR-09..12, FR-26). |
| Next step | Build Analytics (Day 1) → Report (Day 2) → caching/badge (Day 3) → tests/demo prep (Day 4). |

---

## 1. RAG Status — DONE ✅

There is no partial implementation or mock here. Three RAG pipelines are live:

| Pipeline | Files | How it works |
|---|---|---|
| **News ingestion** | `backend/src/app/modules/NewsIngestion/` | Every item embedded at ingest → semantic dedup (cosine ≥ 0.88) + relevance gate vs pooled brand-voice embeddings |
| **Content generation** | `modules/ContentGeneration/contentGeneration.retrieval.ts` | Topic embedded → top-3 `BrandVoiceExample` + top-3 high-engagement `PlatformPost` by cosine similarity → few-shot prompt. Cold-start fallback when team has no examples |
| **Chat (Ask Growth Studio)** | `modules/Chat/chat.retrieval.ts` | Question embedded → intent classified (news vs performance) → top-5 news / top-3 posts by similarity → prompt with conversation history |

**Infrastructure:**
- Embeddings: OpenRouter `openai/text-embedding-3-small`, 1536-dim (`lib/embeddings.ts`)
- Vector storage: MongoDB Atlas — `news_items`, `brand_voice_examples`, `platform_posts` (indexes via `npm run db:create-indexes`)
- Retrieval: in-app cosine similarity (`lib/similarity.ts`) — a **documented, deliberate deviation** from `$vectorSearch` (fine at team scale)
- Verified by: `verify:semantic-dedup`, `verify:chat-retrieval`, `verify:content-generation-retrieval` + integration tests

---

## 2. Backend Architecture Analysis ✅

Clean service-based layered architecture: **controller → service → Mongoose model**, one folder per feature (`modules/<Feature>/` with model / interface / service / controller / route / validation).

**Stack:** Express 5 + TypeScript · MongoDB Atlas (Mongoose) · Redis (ioredis) · OpenRouter (LLM + embeddings) · node-cron · Docker.

**11 modules, 45+ endpoints:**

| Module | Endpoints | Status |
|---|---|---|
| User/Auth | login, me, user CRUD (JWT, 3-tier RBAC: user/admin/super_admin) | ✅ |
| Team | CRUD, members, custom categories | ✅ |
| PlatformCatalog | Global platform curation + per-team enable/disable | ✅ |
| PlatformCredential | AES-256-GCM encrypted tokens, `.env` bootstrap fallback | ✅ |
| NewsItem + Ingestion | 5 sources (HN, Dev.to, GitHub, Reddit, RSS), 4-layer pipeline, 3h cron + admin trigger | ✅ |
| NewsItemCategoryOverride | Per-team category/score overrides | ✅ |
| ContentGeneration | `POST /content/generate` — 5 formats via brand-voice RAG | ✅ |
| Chat | `POST /chat` — RAG chat, multi-turn via conversation_id | ✅ |
| BrandVoiceExample | CRUD (few-shot source) | ✅ |
| PlatformPost | CRUD + metrics + embedding | ✅ (but nothing populates it from real APIs yet) |

**Quality:** Zod validation everywhere, OpenAPI 3.1 + Swagger UI at `/api/v1/docs`, 28 integration tests (Jest + mongodb-memory-server + OpenRouter mock), zero TODO comments, startup connectivity verification, graceful degradation patterns throughout.

---

## 3. Requirements Comparison

### Done (matches requirements)

FR-01..05 (ingestion, dedup, categorization, relevance gate, feed filtering) · FR-13..19 (all 5 content formats + brand-voice RAG + analytics-personalized generation) · FR-21..23 (copy, chat, RAG-grounded answers) · FR-25 (admin ingestion trigger) · multi-team RBAC + encrypted credentials (pulled into scope 07-14).

### Missing — the real gap ⚠️

Verified directly: **no Analytics or Report module is registered in `backend/src/app/routes/index.ts`.** Git commit `5c0c7c1` ("dynamic social handle analytics") updated docs/specs only — no code shipped. These were Robayat's ⏳ items in MASTER-PLAN.md.

| # | Gap | Requirement | Priority |
|---|---|---|---|
| 1 | **Social handle analytics job** — fetch 30-day FB/YouTube data per team per enabled platform, populate `platform_posts` + `platform_analytics` rollups, 6h cron | FR-06, NFR-05 | **Must Have** |
| 2 | **Cross-platform 30-day report endpoint** — overview, per-platform breakdown, Banglish AI insight, opportunity ranking, Redis 6h cache, <15s | FR-09..12, NFR-04 | **Must Have** ("never cut" per MASTER-PLAN) |
| 3 | Admin analytics refresh trigger | FR-26 | Should Have |
| 4 | Team-aware "High opportunity" badge | FR-24 | Should Have |
| 5 | 24h Redis cache for generated content | FR-20 | Should Have |

**Knock-on effect:** because nothing populates `platform_posts` from real platform APIs, the chat "performance" context and content-generation personalization currently have no real data behind them — the analytics job fixes all three at once.

---

## 4. Plan — Remaining Backend Work (4 days)

### Day 1 (Must) — Analytics module · FR-06, FR-26, NFR-05

Create `backend/src/app/modules/Analytics/` following the NewsIngestion adapter pattern:

- **`analytics.model.ts`** — `platform_analytics` rollup (requirements §5.8): `team_id, platform, status ('ok'|'pending_approval'|'not_connected'|'error'), period, overview{reach,engagements,views,engagement_rate}, top_posts[], best_times[], content_breakdown[], fetched_at`. Unique `(team_id, platform)`.
- **`adapters/`** — `facebook.ts` (Meta Graph API), `youtube.ts` (Data API v3), `linkedin.ts` (returns `pending_approval` — pre-agreed descope cut #1), `mock.ts` (deterministic realistic 30-day posts, seeded on team+platform, topics aligned with news categories), `index.ts` registry. `ANALYTICS_USE_MOCK_ADAPTERS=true` swaps mock in for all platforms.
- **`analytics.rollup.ts`** — pure function `posts[] → rollup` (unit-testable without Mongo).
- **`analytics.service.ts`** — `runAnalyticsRefresh(filter?)`: each team × enabled platform → resolve token via existing `lib/platformCredentials.ts` (missing token → status rollup, never crashes siblings) → adapter fetch (per-platform try/catch) → embed **only new** post_ids (bounds OpenRouter quota) → bulk upsert `PlatformPost` → compute + upsert rollup → invalidate `report:{team_id}` in Redis.
- **Routes** — `POST /analytics/refresh` (admin, **FR-26**), `GET /analytics?team_id=` (team member, feeds "pending approval" UI).
- **Wiring** — cron in `lib/scheduler.ts` (`ANALYTICS_REFRESH_CRON`, default `0 */6 * * *`), start in `server.ts`, register in `routes/index.ts`, optional-with-default env vars in `config/index.ts`.
- **Demo insurance (mandatory):** `scripts/seedDemoAnalytics.ts` (`npm run seed:demo-analytics`) — idempotent seed of realistic `platform_posts` + rollups with real embeddings, so the report/badge/chat-performance-context work **even if platform tokens never arrive**.

### Day 2 (Must) — Report module · FR-09..12, NFR-04

Create `backend/src/app/modules/Report/` — **stateless + Redis-cached, no Mongo model** (matches the ContentGeneration precedent):

- **`report.aggregate.ts`** — pure aggregation: 30-day overview + delta vs prior 30 days from `platform_posts`; per-platform sections from `platform_analytics` rollups.
- **`report.opportunities.ts`** — FR-12: top ~20 news by `trend_score` × `audience_match` (engagement-weighted max cosine vs team post embeddings) → top 5 with suggested platform/format. Export `computeAudienceMatch` for FR-24 reuse.
- **`report.prompt.ts`** — Banglish insight prompt; all numbers precomputed, LLM writes narrative only (**one** LLM call).
- **`report.service.ts`** — `assertTeamAccess` → Redis `report:{team_id}` (SETEX 6h) → on LLM failure **degrade to `ai_insight: null`**, never a 502 on demo day.
- **Route** — `GET /reports?team_id=` (+ admin-only `refresh=true` cache bypass).

NFR-04 (<15s) is safe: one LLM call, everything else is Mongo reads + arithmetic; warm cache = milliseconds.

### Day 3 (Should) — FR-20 + FR-24 + real adapters

- **FR-20:** Redis get/setex around the LLM call in `contentGeneration.service.ts`, key `content:{team_id}:{news_item_id ?? sha256(topic)}`, 24h TTL. ~30 lines.
- **FR-24:** optional `team_id` on `GET /news-items` → annotate `high_opportunity` via `computeAudienceMatch` (team top-post embeddings cached in Redis 6h). **Fallback if out of time:** frontend badge on global `opportunity_score >= 7.5` — zero backend work.
- **Real FB/YouTube adapters (token-gated):** only if Mursalin's tokens arrive — `npm run verify:credentials`, flip `ANALYTICS_USE_MOCK_ADAPTERS=false`, one live refresh. Otherwise mock + seed carry the demo.


### Priority / descope order

| Tier | Items |
|---|---|
| **Must (Day 1–2)** | Analytics model + mock adapter + rollup + orchestrator + cron + FR-26 endpoint + seed script; Report endpoint with cache + LLM degradation |
| **Should (Day 3)** | Real FB/YT adapters (token-gated), FR-20 cache, FR-24 team-aware badge, integration tests |
| **Droppable** | LinkedIn beyond `pending_approval`, `GET /analytics` status endpoint, FR-24 team-aware version (use threshold fallback) |

### Key risks

1. **OpenRouter free-tier quota** (already hit once during chat verification) → embed only unseen posts, one LLM call per report, degradation paths everywhere.
2. **Platform tokens may never arrive** → mock adapters + seed script guarantee the demo; degradation statuses (`pending_approval`/`not_connected`) are genuinely exercised either way.

### Verification checklist

- [ ] `npm run typecheck` pass
- [ ] `seed:demo-analytics` → `POST /analytics/refresh` → `GET /reports?team_id=` returns full report <15s cold, instant warm
- [ ] `GET /news-items?team_id=` shows `high_opportunity` flags
- [ ] Swagger UI at `/api/v1/docs` reflects the new endpoints
