## Why

The backend has zero automated tests (`npm test` is a stub) — the only verification today is a set of ad hoc `verify:*` scripts that hit live external services (OpenRouter, MongoDB Atlas) and must be run and eyeballed manually. As the API surface has grown (auth, teams, chat, content generation, news ingestion, platform credentials) there is no repeatable way to catch regressions before a demo, and no safety net for the hackathon's remaining feature work.

## What Changes

- Add a backend test framework (Jest + ts-jest + Supertest) with an isolated test environment: `mongodb-memory-server` for MongoDB and `ioredis-mock` for Redis, so tests run without touching real Atlas/Redis instances or costing OpenRouter tokens.
- Add a `.env.test` (or equivalent test env loader) with dummy-but-valid values that satisfy `config/index.ts`'s zod schema, and stub/mock the OpenRouter client so LLM-dependent routes (chat, content generation, categorization) are testable without real API calls.
- Add `npm test` (and `test:watch`) scripts in `backend/package.json`, replacing the current stub.
- Write integration tests that boot the real Express `app` (via `supertest`) and exercise routes end-to-end through the real Mongoose models, covering the primary auth-gated flows: auth/team lifecycle, platform credentials, news items, content generation, and chat.
- Add a lightweight test-data/fixture helper (e.g. factory functions for User/Team/NewsItem) so tests don't hand-roll Mongoose documents inline.
- Wire the new test script into a CI-friendly command (no CI pipeline changes in this change — just make `npm test` exit non-zero on failure so it's CI-ready).

## Capabilities

### New Capabilities
- `backend-integration-testing`: Test infrastructure and coverage for exercising the Express API end-to-end (real app + in-memory DB, mocked external services) across the auth, team, platform-credential, news-item, content-generation, and chat modules.

### Modified Capabilities
- (none — no existing product-facing requirements change; this only adds test infrastructure and coverage)

## Impact

- **Affected code**: `backend/package.json` (new devDependencies + scripts), new `backend/src/__tests__/` (or `backend/tests/`) directory, new `backend/jest.config.ts`, new `backend/.env.test`, possibly a thin seam added to `backend/src/app/lib/openrouterClient.ts` / `backend/src/app.ts` to make the app instance importable without starting the HTTP listener and to make the OpenRouter client mockable.
- **Dependencies added**: `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `mongodb-memory-server`, `ioredis-mock`.
- **Not affected**: frontend (`frontend/`) is out of scope for this change; no production runtime code paths change behavior, only test seams are added where needed.
