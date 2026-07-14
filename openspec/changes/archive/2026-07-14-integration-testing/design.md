## Context

`backend/src/app.ts` already exports the Express `app` instance separately from `backend/src/server.ts` (which calls `mongoose.connect` + `app.listen`) — so tests can `import app from '../app'` and drive it with `supertest` without booting a real HTTP server or a real MongoDB connection.

Config (`backend/src/app/config/index.ts`) is parsed eagerly at import time via a zod schema requiring `DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `JWT_SECRET`, and a 32-byte `CREDENTIAL_ENCRYPTION_KEY` (base64/hex) — any test run must supply valid-shaped values for all of these before the first `import` of anything that touches config, or the process throws on load.

Auth (`backend/src/app/middleware/auth.ts`) reads the bearer JWT, then re-fetches the user and team memberships from MongoDB on every request (by design, so role/team changes take effect immediately) — so integration tests need a real (in-memory) Mongo with seeded `User`/`Team` documents, not a mocked auth layer.

LLM calls go through a single exported `openrouter` client (`backend/src/app/lib/openrouterClient.ts`, an `openai` SDK instance). Chat, content generation, and news categorization all import this one object, so mocking it once (via `jest.mock`) covers all LLM-dependent routes.

Redis (`backend/src/app/lib/redis.ts`) is used for caching/rate-limiting-style concerns; it's a peripheral dependency for the routes in scope, not the primary data store, so an in-memory fake (`ioredis-mock`) is sufficient rather than spinning up a real Redis.

## Goals / Non-Goals

**Goals:**
- Make `cd backend && npm test` run a real, repeatable integration suite with no external network dependency (no real Atlas, no real Redis, no real OpenRouter spend) and no manual setup beyond `npm install`.
- Exercise the actual Express app + real Mongoose models + real auth middleware, not hand-mocked route handlers — so tests catch wiring bugs (bad route registration, broken validation, wrong status codes) that unit tests would miss.
- Cover the primary flows across auth/team, platform credentials, news items, content generation, and chat modules, including both the happy path and the key auth/permission failure modes (401/403).
- Keep the suite fast enough to run before every commit during the hackathon (target: whole suite under ~30s).

**Non-Goals:**
- No frontend/E2E/browser testing (out of scope for this change; may be a follow-up change).
- No CI pipeline / GitHub Actions wiring — only making `npm test` itself CI-ready (correct exit codes).
- No load/performance testing.
- No testing of the real external adapters (Reddit/HN/RSS/GitHub Trending ingestion sources, real platform posting to FB/YouTube/LinkedIn) — these hit third-party APIs and stay covered by the existing manual `verify:*` scripts.
- Not replacing or removing the existing `verify:*` scripts — they remain useful for manual live-service smoke checks; this change adds a separate, faster, offline suite.

## Decisions

**Test runner: Jest + ts-jest, not Vitest.**
The backend is CommonJS (`"type": "commonjs"` in `package.json`) and already has an established `tsc`/`ts-node-dev` toolchain. Jest + ts-jest is the more conventional pairing for a CommonJS TS Express backend and has first-class `mongodb-memory-server` and `supertest` community support. Vitest would need extra ESM/CJS interop configuration for no real benefit here.

**Database: `mongodb-memory-server`, not a real test Atlas cluster.**
Spins up a real `mongod` in-process per test run — genuine Mongoose/MongoDB behavior (indexes, validation, aggregation) without network dependency, shared state between test runs, or burning Atlas quota. Alternative considered: a dedicated Atlas "test" database — rejected because it requires network access in CI/offline dev, and risks test runs colliding or leaking data across parallel runs.

**Redis: `ioredis-mock`, not a real Redis instance.**
Redis is not the source of truth for any data asserted on in these tests; an in-memory fake avoids requiring a running Redis during `npm test`. If a future test needs to assert cache behavior precisely, `ioredis-mock`'s API compatibility with `ioredis` is sufficient.

**LLM calls: `jest.mock('.../lib/openrouterClient')` with canned responses, not real OpenRouter calls.**
Keeps the suite free, deterministic, and fast. Each test file that exercises an LLM-backed route (chat, content generation, news categorization) mocks the shape of response the route expects (e.g. `chat.completions.create` resolving to a fixed completion). Alternative considered: record/replay via a cassette library (e.g. `nock`-style) — rejected as unnecessary complexity for a hackathon timeline; a direct module mock is simpler and the request/response contracts are already well-typed.

**App under test: import the existing `app` from `backend/src/app.ts` directly.**
No new "app factory" needed — `app.ts` already builds and exports the Express instance without calling `.listen()`. Tests get a fresh in-memory DB per test file (connect in `beforeAll`, drop collections in `afterEach`, disconnect in `afterAll`) while reusing the single app instance.

**Test environment config: a dedicated `backend/.env.test` loaded by a Jest global setup file.**
Provides valid-shaped dummy values (`JWT_SECRET`, a real base64 32-byte `CREDENTIAL_ENCRYPTION_KEY` generated once and committed as a dummy, placeholder `OPENROUTER_API_KEY`) so `config/index.ts`'s zod parse succeeds without touching the developer's real `.env`. `DATABASE_URL`/`REDIS_URL` in this file are placeholders — the actual connections used in tests are the in-memory/mock ones wired up in test setup, not read from these env vars at runtime for data access.

**Fixtures: plain factory functions, not a fixture library.**
Small `createTestUser()`, `createTestTeam()`, `createAuthToken()` helpers under `backend/src/__tests__/support/` — enough to keep tests readable without pulling in a fixture framework (e.g. `factory-girl` equivalents) that the hackathon timeline doesn't need.

**Directory layout: `backend/src/__tests__/`, mirroring module names.**
E.g. `backend/src/__tests__/auth.integration.test.ts`, `team.integration.test.ts`, `platformCredential.integration.test.ts`, `newsItem.integration.test.ts`, `contentGeneration.integration.test.ts`, `chat.integration.test.ts`, plus `support/` for fixtures and `support/testEnv.ts` for the Mongo/Redis lifecycle helpers. Keeps tests colocated with `src` (matches `ts-jest`'s default resolution) rather than a separate top-level `tests/` folder.

## Risks / Trade-offs

- **[Risk]** `mongodb-memory-server` downloads a `mongod` binary on first run, which can be slow or fail on a restricted/offline network. → **Mitigation**: document the one-time download in the proposal/README; the binary is cached after first run so subsequent runs (and CI with a cache step, later) are fast.
- **[Risk]** Mocking `openrouter` at the module level means tests won't catch real prompt/response drift against the actual OpenRouter API (e.g. a model deprecation or schema change). → **Mitigation**: this is an accepted trade-off — the existing `verify:chat-live` / `verify:content-generation-retrieval` scripts remain the source of truth for live-service correctness; the new suite only guards route wiring, validation, and business logic.
- **[Risk]** `ioredis-mock` doesn't perfectly replicate real Redis (e.g. clustering, some Lua scripting behavior). → **Mitigation**: acceptable since Redis usage in the modules under test is simple key/value caching, not scripted logic; any test asserting nuanced Redis behavior can fall back to a real Redis if it becomes necessary later.
- **[Risk]** Committing a dummy `CREDENTIAL_ENCRYPTION_KEY` / `JWT_SECRET` in `.env.test` could be mistaken for a real secret or accidentally reused in production. → **Mitigation**: clearly comment the file as test-only/non-secret, and confirm `.env.test` is not excluded from git the way `.env` is (it must be committed so `npm test` works out of the box for every contributor).
- **[Trade-off]** Sharing one `mongodb-memory-server` instance across a test file's suite (rather than one per test) speeds up runs but means tests must clean up their own data (`afterEach` collection drop) to stay isolated — a missed cleanup could cause cross-test flakiness. Documented as a required pattern in every test file.

## Migration Plan

1. Add devDependencies and Jest config; add `backend/.env.test`.
2. Add `support/` helpers (DB lifecycle, fixtures, auth token helper, OpenRouter mock helper).
3. Add integration test files module-by-module, starting with auth/team (everything else depends on being able to authenticate), then platform credentials, news items, content generation, and chat.
4. Update `backend/package.json` `test`/`test:watch` scripts.
5. No production code migration or rollback needed — this change is additive (test-only files + minor package.json script changes); reverting is simply deleting the new files if ever needed.

## Open Questions

- Should the suite eventually run in CI (e.g. GitHub Actions) as part of this hackathon, or is "runs locally on demand" sufficient for now? (Assumed: local-only for this change, per the proposal's Impact section — CI wiring explicitly out of scope.)
