## 1. Backend module scaffolding

- [x] 1.1 Create `backend/src/app/modules/Chat/chat.interface.ts` — `ChatRequest` (`team_id`, `message`, `conversation_id?`), `ChatResponse` (`conversation_id`, `reply`), `ChatContext` shape for retrieved news/post/brand-voice snippets
- [x] 1.2 Create `backend/src/app/modules/Chat/chat.model.ts` — `ChatMessage` schema (`team_id`, `conversation_id`, `role: 'user' | 'assistant'`, `content`, `created_at`), indexed on `{ team_id: 1, conversation_id: 1, created_at: 1 }`
- [x] 1.3 Create `backend/src/app/modules/Chat/chat.validation.ts` — Zod validation for `POST /chat` body (`team_id` required string, `message` required non-empty string, `conversation_id` optional string)

## 2. Retrieval

- [x] 2.1 Create `backend/src/app/modules/Chat/chat.intent.ts` — pure keyword classifier over the question text returning `{ news: boolean, performance: boolean }` (default both `true` when neither matches), covering platform names/Bengali equivalents and news/trend/performance terms
- [x] 2.2 Create `backend/src/app/modules/Chat/chat.retrieval.ts`:
  - [x] 2.2.1 `fetchNewsContext(teamId, questionEmbedding)` — candidate pool of top-N `NewsItem` by `trend_score`, re-ranked by cosine similarity to the question embedding, top-5 kept
  - [x] 2.2.2 `fetchPerformanceContext(teamId, questionEmbedding)` — reuse `rankPlatformPosts`-style ranking from `contentGeneration.retrieval.ts` (or extract/share the ranking function) scoped to `teamId`
  - [x] 2.2.3 `fetchConversationHistory(teamId, conversationId, limit)` — last N `ChatMessage` docs for the thread, ordered oldest→newest
- [x] 2.3 Unit-test `chat.intent.ts` and the ranking functions in `chat.retrieval.ts` with plain data (no Mongo), following the pattern in `contentGeneration.retrieval.ts`

## 3. Prompt + service

- [x] 3.1 Create `backend/src/app/modules/Chat/chat.prompt.ts` — system prompt scoping the assistant to Growth Studio data (trending news, team performance, content recommendations), Banglish/English tone matching `lib/mock/chat.ts`'s `INITIAL_MESSAGE` voice; `buildMessages(question, context, history)` assembling system + prior turns + retrieved context + new question
- [x] 3.2 Create `backend/src/app/modules/Chat/chat.service.ts`:
  - [x] 3.2.1 `assertTeamAccess` reuse/import (mirror `contentGeneration.service.ts`)
  - [x] 3.2.2 `askChat(payload, requestingUser)`: validate team access → resolve/create `conversation_id` → embed the question → classify intent → run retrieval (both paths run in parallel via `Promise.all` when both apply) → load conversation history → build messages → call `chatCompletion({ model: LLM_MODELS.standard, messages })` → persist user message, then assistant message, on success → return `{ conversation_id, reply }`
  - [x] 3.2.3 On `chatCompletion` failure: throw `AppError(BAD_GATEWAY, ...)` without persisting the assistant turn (user turn may already be persisted)
- [x] 3.3 Create `backend/src/app/modules/Chat/chat.controller.ts` — `catchAsync` wrapper calling `ChatService.askChat`, `sendResponse` with the result
- [x] 3.4 Create `backend/src/app/modules/Chat/chat.route.ts` — `router.use(requireAuth)`, `POST /` with validation middleware calling the controller

## 4. Wiring

- [x] 4.1 Register `ChatRoutes` in `backend/src/app/routes/index.ts` under `/chat`
- [x] 4.2 Add OpenAPI path doc `backend/src/app/docs/chatPaths.ts` (mirror `contentGenerationPaths.ts`) and register it in `backend/src/app/docs/openapi.ts`

## 5. Frontend integration

- [x] 5.1 Add a `sendChatMessage(teamId, message, conversationId?)` client function (fetch wrapper) alongside existing API client conventions
- [x] 5.2 Update `frontend/components/chat/ChatPanel.tsx`: replace the `setTimeout` + `findResponse` mock call with a real fetch to `/api/v1/chat`, track `conversation_id` in component state across turns, surface fetch errors via a toast (Sonner) instead of a canned reply
- [x] 5.3 Confirm `frontend/lib/mock/chat.ts` remains in place (unused by `ChatPanel` but not deleted) per project convention

## 6. Verification

- [ ] 6.1 Manually verify: ask a trend-shaped question, a platform-performance-shaped question, and an ambiguous question against a seeded team, confirming distinct grounded answers for each — BLOCKED: OpenRouter free-tier daily quota (`free-models-per-day`) was exhausted mid-session; embedding + retrieval pipeline confirmed executing correctly against 54 real `NewsItem` docs (reached and failed only at the final `chatCompletion` call), but distinct-answer content could not be confirmed. Re-run `npm run verify:chat-live` once quota resets or credits are added.
- [ ] 6.2 Manually verify a multi-turn follow-up references prior context correctly — BLOCKED, same quota issue as 6.1.
- [x] 6.3 Manually verify a cross-team `conversation_id` is rejected (treated as new conversation, not another team's history) — verified directly: reused the same `conversation_id` across two teams, confirmed each team's `ChatMessage` history stayed scoped to its own `team_id` with no cross-contamination.
- [x] 6.4 Run `cd backend && npm run build` (or equivalent typecheck) and `cd frontend && npm run typecheck`
