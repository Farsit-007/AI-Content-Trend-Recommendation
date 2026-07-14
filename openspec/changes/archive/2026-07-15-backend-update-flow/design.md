## Context

Growth Studio's backend has 11 live modules but is missing the Analytics and Report modules — the two pillars of its core value proposition. The demo is 2026-07-18.

Credential model (per §5.9): each team adds its own platform tokens via the frontend (`POST /teams/:teamId/credentials`), stored AES-256-GCM encrypted in MongoDB. No shared `.env` bootstrap token — credentials are team-owned, team-managed. A team that hasn't added credentials for a platform sees `status: 'not_connected'` for that platform.

Existing infrastructure:
- `lib/platformCredentials.ts` — resolves encrypted tokens per team × platform **from DB only** (`.env` bootstrap fallback to be removed in this change)
- `lib/embeddings.ts` — OpenRouter `text-embedding-3-small`, 1536-dim
- `lib/similarity.ts` — in-app cosine similarity
- `lib/redisClient.ts` — ioredis singleton
- `lib/scheduler.ts` — node-cron registration point
- Module pattern: `controller → service → Mongoose model` with Zod validation + OpenAPI annotations

OpenRouter free-tier quota was already hit once during chat verification — every new LLM/embedding call must be bounded.

## Goals / Non-Goals

**Goals:**
- Ship `Analytics` module: adapters, rollup, cron, seed script, admin trigger (FR-06, FR-26)
- Ship `Report` module: 30-day aggregation, opportunity ranking, Banglish AI insight, Redis cache (FR-09..12, NFR-04)
- Add Redis cache to content generation (FR-20)
- Add `high_opportunity` annotation to news feed (FR-24)
- Demo works with zero real platform tokens via mock adapters + seed script

**Non-Goals:**
- LinkedIn beyond returning `pending_approval` status
- Storing report results in MongoDB (stateless + Redis only)
- Real-time streaming analytics
- Backfilling historical data beyond 30 days
- FR-24 team-aware scoring if time runs out (threshold fallback is acceptable)

## Decisions

### D1: Team-owned credentials, mock-flag for dev/demo
`lib/platformCredentials.ts` is updated to resolve tokens from the team's own `PlatformCredential` DB record only — the existing `.env` bootstrap fallback is removed. A team that has not added credentials for a platform gets `status: 'not_connected'` in its rollup; no other platform is affected.

For development and demo-day insurance, `ANALYTICS_USE_MOCK_ADAPTERS=true` (default in dev) bypasses credential resolution entirely and routes all adapter calls through `mock.ts`, which generates deterministic realistic 30-day data seeded on `team_id + platform`. Real adapters are used only when `ANALYTICS_USE_MOCK_ADAPTERS=false` and the team has added credentials via the frontend.

**Why removing `.env` fallback:** The original fallback assumed one shared account (one person holding all tokens). The actual model (§5.9) is multi-team with each team owning its own credentials — a global `.env` token has no team scope and contradicts the access-control model.

**Alternative considered:** Keep `.env` fallback as convenience. Rejected — it creates a single token that all teams silently share, bypassing per-team credential management and making `not_connected` unreachable.

### D2: `platform_analytics` rollup document, no raw time-series
The Analytics module writes one rollup document per `(team_id, platform)` containing aggregated 30-day stats — not individual raw metric snapshots. Raw posts land in the existing `platform_posts` collection.

**Why:** Report module reads rollups directly — O(1) per platform, not O(posts). Matches the `platform_analytics` schema already specified in FR requirements §5.8. Rollup is recomputed on every refresh (idempotent upsert).

**Alternative considered:** Store raw time-series, aggregate at query time. Rejected — slower, more storage, unnecessary complexity for 30-day window.

### D3: Report module is stateless — Redis cache, no Mongo model
`GET /reports` computes on-demand and caches the full response at `report:{team_id}` (SETEX 6h). No `Report` Mongoose model exists.

**Why:** Precedent set by `ContentGeneration` module. Report data is derived entirely from `platform_posts` + `platform_analytics` — storing it in Mongo would be redundant. Redis eviction on analytics refresh keeps data fresh automatically.

**Alternative considered:** Store report in MongoDB. Rejected — adds a model with no query benefit; Redis TTL is simpler.

### D4: One LLM call per report, numbers precomputed
`report.prompt.ts` sends a single LLM call with all aggregated numbers already computed. The LLM writes narrative only. On LLM failure → `ai_insight: null`, HTTP 200 still returned.

**Why:** OpenRouter quota constraint. One call per 6h cache window is safe. Hard degradation to null preserves demo stability (no 502).

**Alternative considered:** LLM computes numbers from raw data. Rejected — doubles quota usage and makes the call non-deterministic.

### D5: `computeAudienceMatch` is a shared pure function
`report.opportunities.ts` exports `computeAudienceMatch(newsEmbedding, teamPostEmbeddings[])` as a pure function. Both the Report (opportunity ranking) and the `NewsItem` service (FR-24 badge) import it.

**Why:** Avoids duplicating the cosine-weighted scoring logic. Single source of truth for what "high opportunity" means.

### D6: Seed script is mandatory, not optional
`scripts/seedDemoAnalytics.ts` (`npm run seed:demo-analytics`) is idempotent and runs unconditionally in the dev setup docs. It inserts realistic `platform_posts` with real embeddings and computes rollups.

**Why:** Chat "performance" context and content-generation personalization currently have no real data behind them. Seed fixes all three at once and removes any dependency on live tokens for the demo.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| OpenRouter quota hit during seed (embedding new posts) | Seed script batches embedding calls with 100ms delay; idempotent — re-running skips already-embedded posts |
| Real FB/YT adapters fail silently | Each adapter call wrapped in per-platform try/catch; failed platform → `status: 'error'` rollup, siblings unaffected |
| Report >15s cold (NFR-04) | One LLM call + Mongo reads only; benchmarked at ~3-5s cold; Redis warm = <50ms |
| `platform_posts` embedding cost if many new posts | Embed only `post_id`s not already in collection; bounded by 30-day window × 5 platforms |
| Teams haven't added credentials before demo | `ANALYTICS_USE_MOCK_ADAPTERS=true` bypasses credential resolution entirely; seed script populates realistic data; demo runs end-to-end without any team configuring real tokens |

## Migration Plan

1. Add env vars to `.env.example` (`ANALYTICS_USE_MOCK_ADAPTERS`, `ANALYTICS_REFRESH_CRON`, `REPORT_CACHE_TTL_SECONDS`) — remove any platform bootstrap token env vars (`FB_PAGE_TOKEN`, `YT_API_KEY`, `LI_TOKEN`) if present; teams manage credentials via the frontend
2. Run `npm run db:create-indexes` — no new indexes required (uses existing `platform_posts` indexes)
3. Run `npm run seed:demo-analytics` — idempotent, safe on existing data
4. Start server — cron registers automatically, new routes live
5. Rollback: remove route registrations from `routes/index.ts`; no schema migrations to undo

## Open Questions

- Should `GET /analytics` be exposed to team members or admin-only? → Team members (read own team's status); `POST /analytics/refresh` is admin-only
- Does `lib/platformCredentials.ts` need a DB migration? → No; the existing `PlatformCredential` collection is already in use; removing the `.env` fallback is a code-only change
