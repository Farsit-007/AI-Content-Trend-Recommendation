## Context

`ContentGeneration` already established the RAG pattern this project uses: embed a topic, pull candidate few-shot examples from `BrandVoiceExample` and `PlatformPost`, rank by cosine similarity, and hand the assembled context to `chatCompletion()`. The chat feature needs the same shape of pipeline, but driven by a free-text *question* instead of a content *topic*, and additionally needs to draw from `NewsItem` (for "what's trending" questions) and to persist multi-turn history (content generation is stateless — one request, one response).

Auth/team-scoping middleware (`requireAuth`, `assertTeamAccess`) and utilities (`embed`, `cosineSimilarity`, `chatCompletion`, `catchAsync`, `sendResponse`, `AppError`) are all reusable as-is.

## Goals / Non-Goals

**Goals:**
- Answer team-scoped questions about trending news, the team's own platform performance, and content recommendations, grounded in real data.
- Support multi-turn conversation (follow-up questions reference prior turns) via a persisted `conversation_id`.
- Reuse existing retrieval/ranking/LLM utilities rather than inventing a parallel RAG stack.
- Keep the existing frontend UI/UX (starter prompts, typing indicator, bubbles) unchanged — only the data source behind `sendMessage` changes.

**Non-Goals:**
- Streaming token-by-token responses (existing UI already simulates a delay with a typing indicator; a single JSON response is sufficient for this pass).
- Cross-team chat history or admin visibility into other teams' conversations.
- Deleting or migrating `frontend/lib/mock/chat.ts` (project convention keeps mock data until after demo day).
- General-purpose/off-topic chat (out of scope for this feature; the system prompt scopes the assistant to Growth Studio data).

## Decisions

**1. Intent detection is keyword-based, not a separate LLM call.**
A lightweight classifier inspects the question for platform names (facebook/youtube/linkedin/fb/ইউটিউব etc.) and performance words (reach/engagement/views/performance) to decide whether to include `PlatformPost` retrieval, and news/trend words to decide whether to include `NewsItem` retrieval. When neither/both match, both retrieval paths run — cost is one extra Mongo query, not an extra LLM round-trip.
*Alternative considered*: ask the LLM to classify intent first, then retrieve, then answer (2 LLM calls). Rejected for latency/cost — keyword matching is already how `newsIngestion.categorize.ts`-adjacent logic works elsewhere in this codebase, and false positives here just mean slightly more context, not a wrong answer.

**2. `NewsItem` retrieval ranks by a blend of embedding similarity and existing display scores, not similarity alone.**
Unlike brand-voice/post retrieval (where the only signal is "is this similar to the topic"), news questions like "what's trending" need `trend_score`/`opportunity_score` to matter even when similarity is middling. Candidate pool: top 30 by `trend_score` (mirrors `PLATFORM_POST_ENGAGEMENT_POOL_SIZE` pattern in `contentGeneration.retrieval.ts`), then re-ranked by similarity to the question embedding, top 5 kept.

**3. Conversation history is stored per-message in a new `ChatMessage` collection, not embedded as a JSON blob on a session doc.**
Matches the existing per-document Mongoose modeling style (`PlatformPost`, `NewsItem` are one-doc-per-item, not batched). Also makes it trivial to feed "last N messages" into the prompt as plain chat turns without deserializing anything.
*Alternative considered*: keep history client-side only (frontend sends full transcript each request). Rejected — loses history on refresh/device switch, and team-scoped audit of what the assistant told a team is a small but real value here.

**4. New `conversation_id` is a plain UUID string generated server-side on first message of a thread, echoed back to the client to pass on subsequent requests.**
Simplest possible session concept; no separate `Conversation` collection needed since `ChatMessage` documents carry `team_id + conversation_id` and can be queried directly for "last N turns in this thread."

**5. Model choice: `LLM_MODELS.standard`, not `LLM_MODELS.content`.**
`llmClient.ts` already documents `standard` as covering "Categorization, report generation, chat — fast, structured output." Chat answers here are conversational/analytical, not creative long-form copy, so this matches intent and keeps latency lower than the `content` model used for FB/LinkedIn/YouTube generation.

**6. Route placement: `POST /api/v1/chat`, one endpoint, not `/chat/message` + `/chat/history`.**
The frontend only ever needs to send a message and get a reply; it doesn't need a separate history-fetch endpoint for this pass since `ChatPanel` keeps the visible thread in React state for the session and starts fresh on reload (matching current mock behavior — `INITIAL_MESSAGE` resets every mount). A `GET /api/v1/chat/:conversationId` history endpoint is left as a follow-up, not built here.

## Risks / Trade-offs

- **[Risk]** Keyword-based intent detection may miss a Bengali/Banglish phrasing the mock's `MOCK_RESPONSES` keyword list handled but this classifier doesn't. → **Mitigation**: default to running both retrieval paths when no keywords match at all (matches the mock's "no match" fallback in `findResponse`), so the answer degrades to "here's what's generally relevant" rather than an empty context.
- **[Risk]** `NewsItem` candidate pool (top 30 by `trend_score`) is fetched on every chat request with a news-shaped question — no caching. → **Mitigation**: acceptable for hackathon scale (team-scoped, low volume); revisit with a short-TTL Redis cache (already available via `lib/redis.ts`) if this becomes a bottleneck.
- **[Risk]** Storing every chat turn means unbounded growth of `chat_messages` per team. → **Mitigation**: out of scope to solve now (no other collection in this codebase has TTL/pruning either); note as a follow-up.
- **[Trade-off]** No streaming means the user waits for the full LLM response before seeing anything, same as today's fake 1.8s delay — acceptable since it's not a regression versus current UX.

## Migration Plan

No existing data or endpoint to migrate — this is net-new. Deploy order: backend module + route first (additive, no impact on other endpoints), then frontend swap of `ChatPanel.tsx`'s send handler. Rollback is a revert of the frontend commit (falls back to mock instantly) since the backend addition is non-breaking to ship even before the frontend is switched over.

## Open Questions

- Should `conversation_id` ever expire/reset (e.g., new thread per browser session) or persist indefinitely per user? Left as-is (persists indefinitely) until product feedback says otherwise.
