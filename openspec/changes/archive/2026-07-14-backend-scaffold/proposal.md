## Why

Every backend feature in the 4-day plan (news ingestion, filter pipeline, brand-voice RAG, content generation, chat, and Robayat's analytics/scoring work) depends on a working Mongo + Redis + LLM foundation. Right now `backend/` only has a generic Express/Mongoose auth starter — no Redis client, no LLM/embedding client, and a `docker-compose.yml` Mongo image that cannot run `$vectorSearch` at all. Two critical architecture risks flagged in `MASTER-PLAN.md` (#1 Mongo image, #2 unverified OpenRouter embeddings) must be resolved before any of that downstream work starts, per the "Resolve Before Any Backend Code" gate. This change closes both critical fixes and delivers the shared scaffold everyone else builds on.

## What Changes

- **Critical fix #1**: Point `DATABASE_URL` at a real MongoDB Atlas M0 (free-tier cloud) cluster instead of the local `mongo:7-jammy` image — `$vectorSearch` is Atlas-only and the local image will silently fail on every vector query. Remove the local `mongodb` service from `docker-compose.yml` and document Atlas cluster setup.
- **Critical fix #2**: Verify with a live curl call whether OpenRouter serves `nomic-ai/nomic-embed-text` on its embeddings endpoint — it doesn't, but `openai/text-embedding-3-small` does. **Final decision (2026-07-13, superseding the initial local-Ollama choice)**: use OpenRouter for embeddings too, so LLM + embeddings share one API key and one client — no local model runtime required on any teammate's machine.
- Add a Redis client module (`ioredis`) with a shared connection helper other changes (`filter-pipeline`, content caching) will import.
- Add an LLM + embeddings client built on the official `openai` SDK pointed at OpenRouter's `baseURL` (OpenRouter is OpenAI-API-compatible) so future model swaps or new capabilities (streaming, tool calls, structured outputs) are SDK calls, not hand-rolled `fetch` wrappers.
- Extend env config (`backend/src/app/config/index.ts`, `.env.example`, `backend/.env`) with `OPENROUTER_API_KEY`, model name env vars, and the Atlas connection string — remove unused Cloudinary/SMTP/JWT vars.
- **BREAKING**: Remove the generic `Auth` and `User` modules, JWT middleware, Cloudinary uploader, and email sender — none are in the product requirements (user auth/multi-workspace is explicitly out of scope in `project-ida-requirments.md`) and they add dead weight to the shared scaffold every teammate builds on.
- Add a startup connectivity check (Mongo ping, Redis ping, one live LLM/embedding call) so `npm run dev` fails loudly instead of silently if any dependency is misconfigured.

## Capabilities

### New Capabilities
- `backend-scaffold`: Core Node+TS server foundation — Atlas-backed MongoDB connection (vector-search capable), Redis client, OpenRouter LLM + embeddings client with a verified provider and fallback chain, and the environment configuration all backend features depend on.

### Modified Capabilities
_(none — no existing specs in `openspec/specs/` yet; this is the first backend capability)_

## Impact

- **Modified**: `docker-compose.yml` (drop local `mongodb` service, point backend `DATABASE_URL` at Atlas), `.env.example`, `backend/.env`, `backend/src/app/config/index.ts`, `backend/src/app.ts`, `backend/src/server.ts`, `backend/package.json` (add `ioredis`, OpenRouter HTTP client; drop `cloudinary`, `nodemailer`, `jsonwebtoken`, `bcryptjs` if no longer used)
- **Removed**: `backend/src/app/modules/Auth/**`, `backend/src/app/modules/User/**`, `backend/src/app/middleware/auth.ts`, `backend/src/app/utils/CloudinaryImageUploader.ts`, `backend/src/app/utils/EmailSender.ts`
- **New**: `backend/src/app/lib/redis.ts`, `backend/src/app/lib/llmClient.ts`, `backend/src/app/lib/embeddings.ts`, connectivity check run at server startup
- **Downstream unblocked**: `db-vector-indexes`, `news-ingestion-pipeline`, `filter-pipeline`, `brand-voice-rag`, `ai-categorization-scoring`, `content-generator`, `ask-growth-studio-chat` (Samin), plus Robayat's analytics changes which only need the shared `.env` values from this change
