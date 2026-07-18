## 1. Resolver foundation

- [x] 1.1 `lib/modelResolution.ts`: `LlmTask` type, `resolveModelForTask(task, context)` — 4-tier resolution per design.md decision 2, capability-aware, soft-fail-through at every tier
- [x] 1.2 `chatCompletionForTask`/`embedForTask`/`embedBatchForTask` wrappers per design.md decision 3, delegating to the existing static `chatCompletion`/`embed`/`embedBatch` on the bootstrap tier, with excludeKeyId-based failover retry on the non-bootstrap path
- [x] 1.3 `resolveProviderForLiteralModel(modelId)`: narrow helper for the bake-off harness's excluded call site (design.md Non-Goals) — checks the `LlmModel` catalog for a matching `model_id`, falls back to openrouter + bootstrap key
- [x] 1.4 `backend/src/__tests__/modelResolution.test.ts`: 27 tests — all 4 tiers, soft-fail-through at each tier, capability mismatch handling, bootstrap identical-to-today behavior, failover retry (success and no-alternative-available cases), `resolveProviderForLiteralModel`

## 2. LlmTaskDefault + adapter embedBatch (extends A1's LlmProvider module)

- [x] 2.1 `llmProvider.interface.ts`: added `ILlmTaskDefault` + `LLM_TASKS`/`LlmTask`
- [x] 2.2 `llmProvider.model.ts`: added `llmTaskDefaultSchema` + `LlmTaskDefault` model (unique index on `task`)
- [x] 2.3 `llmProvider.service.ts`: `setTaskDefault(task, llmModelId)`, `listTaskDefaults()`, `clearTaskDefault(task)` (added beyond original scope — see task 8.5 note), `listActiveModels()`
- [x] 2.4 `llmProvider.controller.ts` + `.route.ts`: `PUT`/`GET`/`DELETE /llm-providers/task-defaults/:task` (super-admin-only); `GET /llm-providers/models/active` (any authenticated user — registered before the `requireSuperAdmin` gate)
- [x] 2.5 `llmProvider.adapters.ts`: added `embedBatch` to `LlmProviderAdapter`; implemented in `.openrouter.ts`/`.openai.ts` (native array-input embeddings call) and `.anthropic.ts` (throws)
- [x] 2.6 Extended `llmProvider.adapters.test.ts` (+6 tests) and `llmProvider.integration.test.ts` (+10 tests: task-defaults CRUD incl. clear, active-models endpoint)

## 3. Team + request schema changes

- [x] 3.1 `Team.interface.ts`/`.model.ts`: `default_models: Record<string, string>` (task → `LlmModel` id), default `{}`; validation in `team.validation.ts` (`z.record(llmTaskEnum, objectId)`)
- [x] 3.2 `contentGeneration.interface.ts`: `GenerateContentRequest`/`RefineContentRequest` gained optional `llm_model_id`
- [x] 3.3 `contentGeneration.validation.ts`: validation for the new optional field

## 4. Call-site migration (per design.md's inventory table)

- [x] 4.1 `Chat/chat.service.ts`: embed → `embedForTask('embedding', ..., { teamId })`; chatCompletion → `chatCompletionForTask('chat', ..., { teamId })`
- [x] 4.2 `NewsIngestion/newsIngestion.categorize.ts`: → `chatCompletionForTask('categorization', ...)`
- [x] 4.3 `NewsIngestion/newsIngestion.adjudicate.ts`: → `chatCompletionForTask('dedup_adjudication', ...)`
- [x] 4.4 `NewsIngestion/newsIngestion.utils.ts`: embedBatch → `embedBatchForTask('embedding', ...)`
- [x] 4.5 `StylePack/stylePack.service.ts`: → `chatCompletionForTask('style_card', ...)`
- [x] 4.6 `StylePack/stylePack.embeddingStrategy.ts`: chatCompletion (topic summary) → `chatCompletionForTask('style_card', ...)`; every embed/embedBatch → `embedForTask`/`embedBatchForTask('embedding', ...)`
- [x] 4.7 `ContentGeneration/contentGeneration.critique.ts`: `critiqueText` gained optional `teamId` param, threaded from its caller; → `chatCompletionForTask('critique', ..., { teamId })`
- [x] 4.8 `ContentGeneration/contentGeneration.facts.ts`: `extractFactSheet`/`getOrExtractFactSheet` gained optional `teamId` param; → `chatCompletionForTask('fact_extraction', ...)`
- [x] 4.9 `ContentGeneration/contentGeneration.service.ts`: embed → `embedForTask('embedding', ..., { teamId })`; both chatCompletion sites → `chatCompletionForTask('content_generation', ..., { teamId, requestModelId: payload.llm_model_id })`; `teamId` threaded into `critiqueText`/`getOrExtractFactSheet`; `generateContent` now returns `model_used`
- [x] 4.10 `ContentGeneration/contentGeneration.bakeoff.ts`: embed → `embedForTask('embedding', ...)`; the per-cell literal-model call routes through `resolveProviderForLiteralModel` (task 1.3) — bootstrap-tier results delegate to the static `chatCompletion` (preserving its own `LLM_MODEL_FALLBACK` retry and 100% test/mock compatibility), non-bootstrap results go through `getAdapter` — NOT through `chatCompletionForTask` (design.md Non-Goals)
- [x] 4.11 `BrandVoiceExample/brandVoiceExample.service.ts`: → `embedForTask('embedding', ..., { teamId: payload.team_id })`
- [x] 4.12 `NewsItem/newsItem.service.ts`: → `embedForTask('embedding', ...)`
- [x] 4.13 `GeneratedContent/generatedContent.job.ts`: `model_used` now reads `result.model_used` from `generateContent`'s return value instead of the static `LLM_MODELS.content` import
- [x] 4.14 `lib/verifyConnections.ts`: chatCompletion/embed → `chatCompletionForTask('content_generation', ...)`/`embedForTask('embedding', ...)`

## 5. API documentation

- [x] 5.1 `docs/schemas.ts`: added `LlmTaskDefault`, `LlmTaskDefaultSet`, `LlmModelActive`; `GenerateContentRequest`/`RefineContentRequest` gained `llm_model_id`; `Team` gained `default_models`; `GeneratedContent` gained `model_used`
- [x] 5.2 `docs/llmProviderPaths.ts`: task-default (GET/PUT/DELETE) and active-models paths, wired into `openapi.ts`

## 6. Frontend

- [x] 6.1 `lib/api/llmProviders.ts`: thin API client mirroring `lib/api/stylePacks.ts` — provider/key/model CRUD + task-default CRUD (incl. clear) + `listActiveModels()`; added `apiPut` to `lib/api/client.ts`
- [x] 6.2 New `pages/dashboard/admin/AIProviders.tsx`: providers+keys section, models-per-provider section, task-defaults section — mirrors `StylePacks.tsx`'s CRUD-table-plus-dialog pattern
- [x] 6.3 New route entry in `routes/supperAdmin.routes.tsx` + sidebar item ("AI Providers", Cpu icon)
- [x] 6.4 `components/generate/GenerateControls.tsx`: new model dropdown (`activeModels`/`llmModelId`/`onLlmModelChange` props), mirroring the existing `stylePackId`/`onStylePackChange` pair exactly
- [x] 6.5 `pages/dashboard/Generate.tsx`: wired the new picker — `useQuery` for active models, `llm_model_id` passed in generate/refine/regenerate request payloads

## 7. Tests

- [x] 7.1 Updated every existing test file for the 13 migrated call sites (added DB connect/disconnect lifecycle to 4 previously DB-free unit test files whose functions now resolve via Mongo; fixed 2 concurrency-order-dependent assertions in `contentGeneration.integration.test.ts` that broke once per-format resolution added an async DB hop before each HTTP call; added `mockChatCompletionByPrompt` test helper; fixed `contentGeneration.bakeoff.test.ts` compatibility by having the bootstrap tier of the bake-off's literal-model routing delegate to the static `chatCompletion`) — full suite passes with zero `LlmProvider` records configured
- [x] 7.2 New non-bootstrap resolution tests at 3 representative call sites with a real configured `LlmProvider`/`LlmModel`/team default in the test DB: `contentGeneration.integration.test.ts` (team default, request override, inactive-default soft-fail-through), `chat.integration.test.ts` (team default)
- [x] 7.3 `generatedContent.job.integration.test.ts`: tests that `model_used` reflects the actually-resolved model (both bootstrap and team-configured cases), not a stale static import

## 8. Verification

- [x] 8.1 `cd backend && npm test` — 46 suites, 496/496 tests pass
- [x] 8.2 `cd backend && npm run build` — clean
- [x] 8.3 `cd frontend && npm run build && npm run lint` — build clean; lint clean of all changes in this track (4 pre-existing failures remain in untouched files: `TourOverlay.tsx`, `sidebar.tsx`, `use-mobile.ts`, `VoiceProfileSection.tsx`)
- [x] 8.4 Live check: started the real dev stack (backend + Mongo Atlas + a local Redis container), logged in as the real super_admin, created a real `LlmProvider`(OpenRouter) with the real `.env` OpenRouter key, registered a model (`meta-llama/llama-3.3-70b-instruct:free`) distinct from the `.env` bootstrap model, set it as a team's `default_models.content_generation`, and called the real `POST /content/generate` — the real OpenRouter API returned real Bangla content and `model_used` correctly reported the team-configured model, not the bootstrap one. Also verified `GET /llm-providers/models/active` is reachable by a non-super-admin caller and `PUT /llm-providers/task-defaults/:task` sets a global default.
- [x] 8.5 Browser check (Playwright, headless Chromium against the real dev servers): AI Providers admin page — created a provider, added a key, added a model, set a global task default, all via real UI interactions. **This caught a real bug**: the task-defaults section crashed (`Cannot read properties of null`) on a dangling `llm_model_id` reference (populated field is `null` when the referenced `LlmModel` was deleted after the default was set) — fixed with a null-safe read plus a visible "model was deleted" indicator. Also added a previously-missing `DELETE /llm-providers/task-defaults/:task` (unset) endpoint end-to-end, since the crash scenario is trivially reachable (delete a provider whose model is a task default) and there was no way to clear it. Generate page's model picker was verified populated with the real active model and rendered with zero console errors.
