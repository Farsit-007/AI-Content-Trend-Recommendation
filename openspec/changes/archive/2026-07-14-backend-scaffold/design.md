## Context

`backend/` currently holds a generic Express 5 + Mongoose + TypeScript starter (Auth/User modules, JWT, Cloudinary, SMTP) scaffolded before the project requirements were finalized. It connects to a local `mongo:7-jammy` container and has no Redis or LLM client. Per `project-ida-requirments.md` section 5.7, every AI flow in Growth Studio (semantic dedup, Ask Growth Studio chat, Brand Voice RAG, opportunity scoring) runs `$vectorSearch` queries against MongoDB — a feature only available on Atlas (cloud) or the `mongodb-atlas-local` Docker image, never on stock `mongo:7-jammy`. Section 5.5 assumes all LLM and embedding calls go through OpenRouter's free tier, but nobody has confirmed OpenRouter actually serves an embeddings endpoint for `nomic-ai/nomic-embed-text`.

This is a 4-day hackathon (deadline July 16). Samin is fully independent and owns this scaffold; Robayat only needs the resulting `.env` values (Mongo URI, Redis URL) to wire his own analytics changes — he does not depend on any Samin feature code. Constraint: **$0 budget** — every dependency must stay on a free tier (NFR-08).

## Goals / Non-Goals

**Goals:**
- Resolve critical fixes #1 and #2 with a verified, working configuration — not a placeholder
- Ship a minimal, reusable Mongo + Redis + LLM/embeddings client layer that `db-vector-indexes`, `news-ingestion-pipeline`, `filter-pipeline`, `brand-voice-rag`, and Robayat's analytics changes can import directly
- Fail fast and loud at startup if any dependency (Mongo, Redis, LLM key) is misconfigured, so broken config is caught in the first `npm run dev`, not three days later mid-demo
- Strip scaffold cruft (auth/user/cloudinary/email) that has no basis in the requirements, so the codebase teammates build on isn't polluted with dead modules

**Non-Goals:**
- Domain collections/schemas (`news_items`, `brand_voice_examples`, `platform_analytics`) and their vector indexes — that's `db-vector-indexes`, a separate change
- Any ingestion, scoring, or generation logic — those are July 14–15 changes
- CI/offline Mongo story — Atlas requires network access in dev; accepted for this hackathon's timeline (see Risks)

## Decisions

### 1. MongoDB: Atlas M0 cloud cluster, not `mongodb-atlas-local`
Chosen per user direction. Atlas M0 is what `project-ida-requirments.md` assumes throughout (section 5.7, "MongoDB Atlas M0 (free)"), needs no local Docker resource overhead, and gives Robayat/Mehedi the same connection string to point at — no per-machine Docker vector index setup to keep in sync. Trade-off: requires network access and a shared cluster; mitigated by keeping the connection string in `.env` (never committed) and documenting cluster creation steps in this change's tasks.

### 2. Embedding provider: verify first, implement whichever works
Critical fix #2 is explicitly a verification task, not an implementation task — the plan itself says "Verify with one curl today." Curling OpenRouter's `/embeddings` endpoint with `nomic-ai/nomic-embed-text` returned a 400 ("Model does not exist"), but `openai/text-embedding-3-small` returned a 200 with a 1536-dim vector. Initial implementation used local Ollama (`nomic-embed-text`) as a genuinely-$0 stopgap; **superseded per user direction on 2026-07-13** — OpenRouter only, no local model runtime, so every teammate's machine needs nothing beyond the shared `OPENROUTER_API_KEY`. The `embeddings.ts` client still exposes a single `embed(text: string): Promise<number[]>` function so callers never know which model is behind it — swapping the embedding model later is a one-line env var change.

### 3. LLM + embeddings client: `openai` SDK pointed at OpenRouter's `baseURL`
OpenRouter exposes an OpenAI-compatible API, so both the chat and embeddings clients share one `openai` SDK instance (`backend/src/app/lib/openrouterClient.ts`) configured with `baseURL: 'https://openrouter.ai/api/v1'` and `OPENROUTER_API_KEY`. Chosen over a raw `fetch` wrapper (the original approach) per user direction so future model/feature changes (streaming, tool calls, structured outputs, new models) are just SDK calls, not hand-rolled HTTP. Model names come from `.env` (`LLM_MODEL_STANDARD`, `LLM_MODEL_CONTENT`, `LLM_MODEL_FALLBACK`, `EMBEDDING_MODEL`) as named exports so downstream changes don't hardcode model strings.

### 4. Redis: `ioredis`, single shared connection
`ioredis` over `redis` (node-redis) for its more ergonomic TypeScript API and built-in reconnect/retry strategy — matters for a hackathon demo where the connection needs to survive a laptop sleep/wake. One singleton client exported from `backend/src/app/lib/redis.ts`; `filter-pipeline` and content-generation caching (later changes) import it rather than opening new connections.

### 5. Remove Auth/User/Cloudinary/Email modules
`project-ida-requirments.md` §8 (out-of-scope) lists "User authentication and multi-workspace" explicitly. There is no FR that needs login, image upload, or email. Keeping this code means every teammate reading `backend/src/app/modules/` has to figure out it's unused boilerplate rather than real scope. Since this scaffold is what everyone else's PRs will be based on, cleaning it now is cheaper than cleaning it under deadline pressure later.

### 6. Startup connectivity check
`server.ts` currently swallows Mongo connection errors into a `console.log` and starts the HTTP server anyway. Add a `verifyConnections()` step (Mongo ping, Redis ping, one live OpenRouter chat + embedding call) that runs before `app.listen` and exits the process with a clear error message on failure — the whole point of critical fixes #1/#2 is to not discover a broken Mongo/embedding setup mid-integration on July 16.

## Risks / Trade-offs

- **[Risk]** Atlas M0 needs network access; no cluster exists yet → **Mitigation**: tasks.md includes explicit "create Atlas M0 cluster + get connection string" as the first step; document it in this change's PR so Robayat can reuse the same cluster.
- **[Risk]** OpenRouter may not serve embeddings at all, discovered only after starting this change → **Mitigation**: decision #2 makes the curl verification step the literal first task; fallback chain is pre-documented so there's no design pause if OpenRouter fails.
- **[Risk]** Free-tier LLM/embedding rate limits get hit during later ingestion/generation work → **Mitigation**: out of scope for this change (Redis caching lands in `filter-pipeline`/`content-generator`), but the client layer is built so caching wraps around it without changes to `llmClient.ts`/`embeddings.ts`.
- **[Risk]** Removing Auth/User is a **BREAKING** change if any other in-flight branch depends on it → **Mitigation**: confirmed via `project-ida-requirments.md` that no FR needs it; flagged as BREAKING in the proposal so reviewers (Robayat) can object before merge.

## Migration Plan

1. Create MongoDB Atlas M0 cluster, obtain connection string, update `backend/.env` (not committed) and `.env.example` with the Atlas URI shape
2. curl-test OpenRouter `/embeddings` with `nomic-ai/nomic-embed-text`; record the result in this change's notes and pick the provider per decision #2
3. Remove `backend/src/app/modules/Auth/**`, `User/**`, `middleware/auth.ts`, `utils/CloudinaryImageUploader.ts`, `utils/EmailSender.ts`, and their route wiring in `routes/index.ts`
4. Update `backend/src/app/config/index.ts` and `.env.example` to only expose config this scaffold actually uses
5. Add `backend/src/app/lib/redis.ts`, `llmClient.ts`, `embeddings.ts`
6. Add `verifyConnections()` and call it from `server.ts` before `app.listen`
7. Update `docker-compose.yml` — drop the local `mongodb` service, point `backend.environment.DATABASE_URL` at Atlas (via `.env`, not a hardcoded compose value)
8. `npm run typecheck` + manual `npm run dev` smoke test — confirm the process exits with a clear message if `.env` is misconfigured, and starts cleanly when it isn't

No rollback complexity: this is pre-`main` scaffold work on `feat/backend-scaffold`, not a deployed system.

## Open Questions

- Who owns creating/paying-nothing-for the shared Atlas M0 cluster — assumed Samin, confirm in PR
- Final embedding provider is not yet known — depends on the curl verification in step 2; `embeddings.ts`'s single `embed()` export means the answer doesn't change any other file
