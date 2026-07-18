## 1. Crypto foundation

- [x] 1.1 Restore `backend/src/app/lib/crypto.ts` verbatim from `git show ac9cab9^:backend/src/app/lib/crypto.ts` (AES-256-GCM, versioned `v1:<iv>:<authTag>:<ciphertext>`, `encrypt`/`decrypt`)
- [x] 1.2 Restore `decodeKey` helper + `CREDENTIAL_ENCRYPTION_KEY` zod validation in `backend/src/app/config/index.ts`, exporting `credentialEncryptionKey: Buffer`
- [x] 1.3 Add `CREDENTIAL_ENCRYPTION_KEY` to `backend/.env.example` and this deployment's `.env` (generated via `openssl rand -base64 32`); also added to `.env.test` for the test suite
- [x] 1.4 `backend/src/__tests__/crypto.test.ts`: 9 unit tests — round-trip encrypt/decrypt, tamper detection (modified ciphertext/authTag throws), malformed payload throws, unrecognized version prefix throws, two encryptions of the same plaintext produce different ciphertext (random IV), empty-string and long non-ASCII round-trip

## 2. LlmProvider / LlmModel schema

- [x] 2.1 `llmProvider.interface.ts`: `ILlmProviderKey`, `ILlmProvider`, `ILlmModel` per design.md decision 2 (`keys` typed as `Types.DocumentArray<ILlmProviderKey>` so `.id()`/subdocument `.deleteOne()` type-check)
- [x] 2.2 `llmProvider.model.ts`: both schemas in one file (mirroring `stylePack.model.ts`), `encrypted_key` `select: false` on the key subdocument
- [x] 2.3 `llmProvider.validation.ts`: zod schemas for create-provider, add-key, update-key, create-model, update-model

## 3. Provider adapters

- [x] 3.1 Added `@anthropic-ai/sdk@^0.112.3` to `backend/package.json`
- [x] 3.2 `llmProvider.adapters.openrouter.ts`: `chatCompletion`/`embed` via the `openai` SDK pointed at OpenRouter's base URL (mirrors `openrouterClient.ts`'s config) — live-verified against the real OpenRouter API (see task 7.3)
- [x] 3.3 `llmProvider.adapters.anthropic.ts`: `chatCompletion` via `@anthropic-ai/sdk` (system message(s) extracted from `ChatMessage[]` into Anthropic's top-level `system` param, joined if multiple); `embed` throws "anthropic does not support embeddings"
- [x] 3.4 `llmProvider.adapters.openai.ts`: `chatCompletion`/`embed` via the `openai` SDK pointed at OpenAI's real base URL
- [x] 3.5 `llmProvider.adapters.ts`: shared `LlmProviderAdapter` interface + `getAdapter(providerType, apiKey)` resolver
- [x] 3.6 `backend/src/__tests__/llmProvider.adapters.test.ts`: 10 unit tests (mocked `openai`/`@anthropic-ai/sdk` clients) — chatCompletion success for all 3 providers, embed success for openrouter/openai, embed throws immediately for anthropic without a network call, error propagation for empty/malformed responses, system-message extraction and joining

## 4. Service + controller + routes

- [x] 4.1 `llmProvider.service.ts`: `createProvider`, `listProviders` (keys masked), `getProvider`, `updateProvider`, `deleteProvider` (cascades models), `addKey` (encrypt + `key_last4`), `updateKey`, `deleteKey`, `revealKey`, `createModel`, `listModels`, `updateModel`, `deleteModel` — fixed a real bug found during testing: `addKey` was returning the freshly-saved in-memory document, and a subdocument just pushed via `.push()` never goes through `select: false`'s query-time exclusion, so the just-added key's ciphertext was leaking in the response; fixed by re-fetching through a masked query before returning
- [x] 4.2 `llmProvider.controller.ts`: one handler per service function, `catchAsync` + `sendResponse` per existing convention
- [x] 4.3 `llmProvider.route.ts`: routes per design.md decision 4, all behind `requireAuth` + `requireSuperAdmin`
- [x] 4.4 Registered `{ path: '/llm-providers', route: LlmProviderRoutes }` in `backend/src/app/routes/index.ts`

## 5. API documentation

- [x] 5.1 `docs/schemas.ts`: `LlmProvider`, `LlmProviderKey` (masked shape), `LlmProviderCreate`, `LlmProviderAddKey`, `LlmProviderKeyReveal`, `LlmModel`, `LlmModelCreate` schemas
- [x] 5.2 New `docs/llmProviderPaths.ts`: paths for every route in design.md decision 4, wired into `openapi.ts` (new "LLM Providers" tag, all schemas registered)

## 6. Tests

- [x] 6.1 `backend/src/__tests__/llmProvider.integration.test.ts`: 11 tests — full CRUD + reveal flow against a real test DB, masking verified in list/add/read responses (including the addKey leak caught above), reveal (correct plaintext returned, 404 for a keyId belonging to a different provider), toggle key `is_active` independently across multiple keys, add/list/update/delete models, delete provider cascades models, invalid `provider_type` rejected with 400, 401/403 enforcement for unauthenticated and non-super-admin (both `admin` and `user` roles) callers
- [x] 6.2 Confirmed zero existing test file needed changes for `llmClient.ts`/`embeddings.ts`/their call sites — `git diff --stat` on those three files is empty; full pre-existing suite (418 tests) still passes unmodified alongside the 30 new tests (448 total)

## 7. Verification

- [x] 7.1 `cd backend && npm test` — 45 suites, 448/448 tests pass
- [x] 7.2 `cd backend && npm run build` — clean
- [x] 7.3 Live check: only `OPENROUTER_API_KEY` is configured in this deployment (no `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`). Live-verified `getAdapter('openrouter', <real key>)` against the real API via a scratch script (deleted after): `chatCompletion` returned a real response, `embed` returned a real 1536-dim vector. Anthropic/OpenAI adapters could **not** be live-verified — flagged honestly as an open item, same pattern as this session's Reddit-credentials gap, to be re-run when those credentials become available. Their mocked-SDK unit tests (task 3.6) do pass.
- [x] 7.4 Confirmed `llmClient.ts`/`embeddings.ts` and all their existing call sites (content generation, chat, news ingestion, etc.) are byte-for-byte untouched (`git diff` empty) and the full pre-existing test suite for all of them still passes unmodified — no live HTTP spot-check needed beyond that, since this change makes zero code-path changes to those files.
