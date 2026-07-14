## 1. Test infrastructure setup

- [x] 1.1 Add devDependencies to `backend/package.json`: `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `mongodb-memory-server`, `ioredis-mock`
- [x] 1.2 Add `backend/jest.config.ts` (ts-jest preset, `testEnvironment: 'node'`, global setup/teardown files, `testMatch` for `src/__tests__/**/*.test.ts`)
- [x] 1.3 Create `backend/.env.test` with dummy-but-schema-valid values (generate and commit a throwaway base64 `CREDENTIAL_ENCRYPTION_KEY`, `JWT_SECRET`, placeholder `OPENROUTER_API_KEY`, etc.), clearly commented as test-only/non-secret
- [x] 1.4 Add a Jest global setup that loads `.env.test` before any other import, so `config/index.ts`'s zod parse succeeds
- [x] 1.5 Replace the `test` script in `backend/package.json` with `jest --runInBand` and add a `test:watch` script
- [x] 1.6 Confirm `npm test` runs (even with zero test files) and exits 0

## 2. Shared test support

- [x] 2.1 Add `backend/src/__tests__/support/db.ts`: start/stop `mongodb-memory-server`, connect/disconnect Mongoose, and a `clearDatabase()` helper to drop all collections between tests
- [x] 2.2 Add `backend/src/__tests__/support/redisMock.ts`: wire `ioredis-mock` in place of the real `ioredis` client used by `backend/src/app/lib/redis.ts` (via `jest.mock`)
- [x] 2.3 Add `backend/src/__tests__/support/openrouterMock.ts`: `jest.mock` for `backend/src/app/lib/openrouterClient.ts` with a helper to set a canned chat-completion response per test
- [x] 2.4 Add `backend/src/__tests__/support/fixtures.ts`: factory functions `createTestUser()`, `createTestTeam()`, `createAuthToken(user)` (signs a real JWT with the test `JWT_SECRET`)
- [x] 2.5 Add a shared `beforeAll`/`afterEach`/`afterAll` pattern (documented in a short comment in `db.ts`) that each integration test file follows: connect once, clear collections after each test, disconnect once

## 3. Auth and team integration tests

- [x] 3.1 `backend/src/__tests__/auth.integration.test.ts`: login success, login with bad credentials, `/auth/me` with valid token, `/auth/me` with no token (401), `/auth/me` with expired/malformed token (401)
- [x] 3.2 `backend/src/__tests__/user.integration.test.ts`: admin creates user (2xx), non-admin creates user (403), admin lists users
- [x] 3.3 `backend/src/__tests__/team.integration.test.ts`: admin creates team, list teams, get team by id (member vs. non-member 403), update team (admin-only), delete team (admin-only), add/remove member, add/remove category, non-member category access (403)

## 4. Platform credential integration tests

- [x] 4.1 `backend/src/__tests__/platformCredential.integration.test.ts`: team member upserts a credential, lists credentials, reveals a credential and asserts round-trip value matches, deletes a credential, outsider (non-member, non-admin) gets 403 on list/reveal/delete

## 5. News item integration tests

- [x] 5.1 `backend/src/__tests__/newsItem.integration.test.ts`: unauthenticated list (200), get single item, authenticated create/update/delete, admin-only `/ingest` (403 for non-admin), set/clear category override and verify it's reflected on subsequent fetch

## 6. Content generation integration tests

- [x] 6.1 `backend/src/__tests__/contentGeneration.integration.test.ts`: mock OpenRouter response, authenticated `POST /generate` returns 200 with content derived from the mock, unauthenticated request returns 401, assert the real OpenRouter client was never invoked

## 7. Chat integration tests

- [x] 7.1 `backend/src/__tests__/chat.integration.test.ts`: mock OpenRouter response, authenticated `POST /` returns 200 with an answer derived from the mock, unauthenticated request returns 401, assert the real OpenRouter client was never invoked

## 8. Verification

- [x] 8.1 Run `cd backend && npm test` and confirm all tests pass with no real network calls (verify by temporarily disabling network access or checking no unexpected outbound requests are logged)
- [x] 8.2 Run `cd backend && npm run typecheck` and confirm the new test files pass type checking
- [x] 8.3 Time the full suite run and confirm it completes in well under a minute
