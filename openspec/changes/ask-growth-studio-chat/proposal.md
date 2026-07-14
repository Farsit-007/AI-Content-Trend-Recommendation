## Why

The `/dashboard/chat` "Ask Growth Studio" page is fully mocked: `ChatPanel.tsx` calls `findResponse()` against a hardcoded keyword→canned-answer table in `lib/mock/chat.ts` behind a fake `setTimeout` delay. It cannot answer questions about a team's actual trending news, real platform performance, or real content recommendations — it just echoes static Bengali/English copy regardless of team or input. The rest of the platform (news ingestion, scoring, content generation, brand-voice RAG) already has real data to answer these questions from; the chat feature needs a real backend endpoint wired to it.

## What Changes

- Add a new backend module `Chat` exposing `POST /api/v1/chat` (team-scoped, auth-required like `ContentGeneration`) that answers a free-text question using retrieval-augmented generation over the team's own data.
- Retrieval pulls from three existing collections, chosen by lightweight intent detection on the question (or all three when ambiguous):
  - `NewsItem` — trending/opportunity news, ranked by embedding similarity to the question plus `trend_score`/`opportunity_score`.
  - `PlatformPost` — the team's own post performance/metrics, for "how did our Facebook/YouTube do" style questions.
  - `BrandVoiceExample` — reused only to keep tone/voice consistent in the answer, same as content generation.
- Compose retrieved context into a prompt (Bengali/English "Banglish" mixed responses, matching the existing mock tone) and call `chatCompletion` with `LLM_MODELS.standard`.
- Persist conversation turns per team+user in a new `ChatMessage` collection so a thread has continuity across requests (the endpoint accepts an optional `conversation_id`; omitting it starts a new thread).
- Frontend: replace `findResponse()`/mock `setTimeout` in `ChatPanel.tsx` with a real fetch to `/api/v1/chat`, keeping the existing UI (starter prompts, typing indicator, message bubbles) unchanged. Mock file stays in `lib/mock/chat.ts` per project convention (not deleted) but is no longer imported by the panel.
- Add OpenAPI docs for the new endpoint, following the `contentGenerationPaths.ts` pattern.

## Capabilities

### New Capabilities
- `growth-studio-chat`: team-scoped conversational Q&A endpoint that retrieves relevant news/performance/brand-voice context and answers via LLM, with persisted conversation history.

### Modified Capabilities
(none — no existing capability specs exist yet in `openspec/specs/`)

## Impact

- **Backend**: new module `backend/src/app/modules/Chat/` (interface, model, retrieval, prompt, service, controller, route, validation), registered in `backend/src/app/routes/index.ts`; new OpenAPI doc file registered in `backend/src/app/docs/openapi.ts`.
- **Frontend**: `frontend/components/chat/ChatPanel.tsx` changes from mock-driven to fetch-driven; no changes to `MessageBubble.tsx`, `TypingIndicator.tsx`, or page routing.
- **Database**: new `chat_messages` collection (team_id, conversation_id, role, content, created_at); no changes to existing collections.
- **Dependencies**: reuses existing `embed()`, `chatCompletion()`, `cosineSimilarity()` utilities — no new packages.
