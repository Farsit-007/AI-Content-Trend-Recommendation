## 1. Critical fix #1 — Atlas MongoDB

- [x] 1.1 Create a MongoDB Atlas M0 (free-tier) cluster and a database user for the project
- [x] 1.2 Obtain the Atlas connection string and set it as `DATABASE_URL` in `backend/.env` (not committed)
- [x] 1.3 Update `.env.example` and `backend/.env.example`-equivalent docs with the Atlas URI shape and a comment explaining `$vectorSearch` requires Atlas
- [x] 1.4 Remove the local `mongodb` service from `docker-compose.yml`; point the `backend` service's `DATABASE_URL` at the Atlas connection string via `env_file` instead of a hardcoded compose value
- [x] 1.5 Confirm connectivity: connect with the new `DATABASE_URL` and run a trivial `$vectorSearch`-shaped aggregation (or `listSearchIndexes`) to confirm the cluster accepts the stage without an "unknown stage" error — **verified live**: connected to Atlas, `$vectorSearch` stage accepted (no "unknown stage" error). Required adding `0.0.0.0/0` to Atlas Network Access since the dev IP rotates.

## 2. Critical fix #2 — verify embedding provider

- [x] 2.1 curl OpenRouter's `/embeddings` endpoint with `nomic-ai/nomic-embed-text` and a sample string; record whether it returns a 768-dim vector or errors — **result: 400 "Model does not exist."** OpenRouter's `/embeddings` endpoint is real and works (confirmed with `openai/text-embedding-3-small`, 200 OK) but does not serve `nomic-ai/nomic-embed-text`, and no free embedding model is available on OpenRouter at all.
- [x] 2.2 If OpenRouter works: note it as the chosen provider. If not: test fallbacks in order (Gemini embedding free tier, Jina AI free tier, Nomic Atlas API, local Ollama) until one returns a usable vector — initial choice: local Ollama (per user decision — genuinely $0, no external signup). `ollama pull nomic-embed-text` completed, live call confirmed a 768-dim vector. **Superseded 2026-07-13** (per user direction: "we want to use only openrouter, no ollama needed"): switched to `openai/text-embedding-3-small` served through OpenRouter itself, confirmed live (200 OK, 1536-dim vector) — no local model runtime dependency.
- [x] 2.3 Record the verified provider and the curl evidence in this change's notes (or PR description) so the decision is traceable — recorded here and in `backend/.env` / `.env.example` comments.
- [x] 2.4 Add the chosen provider's API key/config to `.env.example` and `backend/.env` — `EMBEDDING_MODEL` only now (dropped `EMBEDDING_PROVIDER`/`OLLAMA_BASE_URL`, both unused once OpenRouter serves embeddings too).

**Additional finding (not a pre-existing task, discovered during verification):** the LLM models named in `project-ida-requirments.md` §5.5 (`meta-llama/llama-3.1-8b-instruct:free`, `mistralai/mistral-7b-instruct:free`, `google/gemma-2-9b-it:free`) are no longer free/available on OpenRouter. Replaced with currently-verified free models: `openai/gpt-oss-20b:free` (standard), `openai/gpt-oss-120b:free` (content), `nvidia/nemotron-nano-9b-v2:free` (fallback) — all confirmed live with `"cost":0` in the response.

## 3. Remove out-of-scope boilerplate

- [x] 3.1 Delete `backend/src/app/modules/Auth/` and `backend/src/app/modules/User/`
- [x] 3.2 Delete `backend/src/app/middleware/auth.ts`, `backend/src/app/utils/CloudinaryImageUploader.ts`, `backend/src/app/utils/EmailSender.ts` — also removed `backend/src/app/interface/index.d.ts` (dead `Express.Request.user: JwtPayload` type augmentation, only meaningful with the removed auth module)
- [x] 3.3 Remove auth/user route registrations from `backend/src/app/routes/index.ts`
- [x] 3.4 Remove now-unused dependencies from `backend/package.json` (`bcryptjs`, `cloudinary`, `jsonwebtoken`, `multer`, `nodemailer` if nothing else uses them) and run `npm install` to update the lockfile
- [x] 3.5 Remove JWT/Cloudinary/SMTP env vars from `backend/src/app/config/index.ts` and `.env.example`

## 4. Redis client

- [x] 4.1 Add `ioredis` to `backend/package.json`
- [x] 4.2 Create `backend/src/app/lib/redis.ts` exporting a single shared client configured from `REDIS_URL`
- [x] 4.3 Add a `ping()` helper used by the startup connectivity check

## 5. LLM + embeddings client

- [x] 5.1 Create `backend/src/app/lib/llmClient.ts` wrapping OpenRouter's chat completions, reading `OPENROUTER_API_KEY` from config — **updated 2026-07-13**: built on `backend/src/app/lib/openrouterClient.ts`, a shared `openai` SDK instance pointed at OpenRouter's `baseURL` (replaces the original raw `fetch` wrapper), per user direction to standardize on the SDK for easier future model/feature changes
- [x] 5.2 Export named model constants for each task per the requirements doc: categorization/report/chat model, content-generation model, fallback model
- [x] 5.3 Create `backend/src/app/lib/embeddings.ts` exposing `embed(text: string): Promise<number[]>` backed by the provider chosen in section 2 — **updated 2026-07-13**: now calls `openrouter.embeddings.create()` (same shared SDK client as the LLM client) instead of Ollama's HTTP API
- [x] 5.4 Add a minimal manual test (script or one-off ts-node call) confirming both clients return real responses against live free-tier APIs — re-verified live after the OpenRouter-only switch: `npm run dev` logged `OpenRouter LLM: OK` and `Embeddings (OpenRouter): OK` against the real Atlas/Redis/OpenRouter stack

## 6. Env config + startup connectivity check

- [x] 6.1 Update `backend/src/app/config/index.ts` to expose `openrouter_api_key`, LLM/embedding model names, `database_url`, `redis_url`, `port`, `node_env`, `web_url` only — also fixed a pre-existing bug where `dotenv.config({ path: path.join((process.cwd(), '.env')) })` used the comma operator and silently resolved to a bare relative `.env` path
- [x] 6.2 Create a `verifyConnections()` function (Mongo ping, Redis ping, one live LLM call, one live embedding call) that throws a descriptive error naming the failed dependency
- [x] 6.3 Call `verifyConnections()` in `backend/src/server.ts` before `app.listen`, and `process.exit(1)` with a clear log line on failure
- [x] 6.4 Simplify `backend/src/app.ts` to drop references to removed auth middleware/routes — no changes needed, `app.ts` never referenced the removed modules directly

## 7. Verification

- [x] 7.1 `cd backend && npm run typecheck` passes with no errors — added the missing `typecheck` script to `package.json` (referenced by `SAMIN.md`'s daily workflow but didn't exist)
- [x] 7.2 `npm run dev` starts cleanly against the real Atlas cluster, Redis, and OpenRouter — logs successful connectivity for all three — **verified live**: `docker compose up -d redis` then `npm run dev` logged `MongoDB (Atlas): OK`, `Redis: OK`, `OpenRouter LLM: OK`, `Embeddings (OpenRouter): OK`, then `Server is running on port 5000`. Re-verified after the 2026-07-13 OpenRouter-only switch (see section 2/5 notes) — Ollama is no longer a dependency. (Note: this machine's Node resolver picks up a stale `127.0.0.1` DNS entry — a local Windows/Docker Desktop networking quirk unrelated to the scaffold — which breaks SRV lookups until `dns.setServers([...])` points it at a real resolver; harmless to ignore unless `npm run dev` fails with `querySrv ECONNREFUSED`.)
- [x] 7.3 Temporarily break one env var (e.g. blank `REDIS_URL`) and confirm the process exits with a clear error instead of starting — **verified live**: set `REDIS_URL=redis://localhost:1`, ran the compiled server (`node dist/server.js`) — logged `[verifyConnections] Redis FAILED: Reached the max retries per request limit...` and exited with code 1 before `app.listen`. (Confirmed against the compiled build rather than `ts-node-dev`, since its `--respawn` dev-mode watcher intentionally survives a child `process.exit` to keep watching for fixes — that's expected dev-tool behavior, not a bug.)
- [ ] 7.4 Share the final `.env` values (Mongo URI, Redis URL) with Robayat per the Independence Strategy in `MASTER-PLAN.md` — manual step for you to do now that 7.2 has confirmed the setup works
