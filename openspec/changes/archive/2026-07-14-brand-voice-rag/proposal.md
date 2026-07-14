## Why

The Generate page (`frontend/components/generate/ContentGenerator.tsx`) currently returns canned content from `frontend/lib/mock/content.ts` via a keyword match — it ignores the topic a user actually types and always returns one of five hardcoded demo topics. There is no real content generation backend yet, even though the LLM client already reserves a model tier for it (`LLM_MODELS.content` in `backend/src/app/lib/llmClient.ts`) and the two data sources needed to ground generation in a team's actual voice — `BrandVoiceExample` and `PlatformPost` — already exist with embeddings and vector indexes. This change builds the real backend: given a topic, retrieve the requesting team's own brand-voice examples and top-performing past posts via vector similarity, and use them as few-shot grounding for an LLM call that produces all platform formats at once.

## What Changes

- New `ContentGeneration` backend module: `POST /content/generate` — accepts `{ team_id, topic, news_item_id? }`, returns the 5-format `GeneratedContent` shape the frontend already expects (`facebook_post`, `facebook_reel_script`, `linkedin_post`, `youtube_idea`, `caption`).
- RAG retrieval step, scoped to the requesting team (`team_id`), pulling from two sources:
  - `BrandVoiceExample` — team's submitted voice examples, retrieved by cosine similarity to the topic embedding.
  - `PlatformPost` — team's own published posts, filtered to top performers by engagement `metrics` before similarity ranking.
  - Cold start (team has zero `BrandVoiceExample` entries): skip few-shot retrieval entirely and generate with a generic, brand-neutral system prompt rather than borrowing another team's voice.
- Optional `news_item_id` on the request: when present, reuses the `NewsItem`'s existing `embedding` for retrieval (skipping a redundant embed call) and folds its `category`/`impact_note` into the prompt for context.
- Single structured LLM call per generation request (via `LLM_MODELS.content`), returning all 5 formats as one JSON object — not 5 separate calls.
- Frontend `ContentGenerator.tsx` switches from `findMockContent()` (keyword match over `MOCK_CONTENT`) to calling the new endpoint; `frontend/lib/mock/content.ts` stays in place as a fallback/demo dataset per `CLAUDE.md` (mock data retained until after demo day).

## Capabilities

### New Capabilities
- `content-generation`: RAG-grounded, team-scoped generation of multi-format social content (Facebook post, reel script, LinkedIn post, YouTube idea, caption) from a topic or news item, using a team's own brand-voice examples and top-performing posts as few-shot context.

### Modified Capabilities
- (none — no existing spec's requirements change; this is new backend surface plus a frontend wiring change with no requirement-level impact on other capabilities)

## Impact

- **New backend module**: `backend/src/app/modules/ContentGeneration/` (interface, model N/A — stateless generation, service, controller, route, validation), registered in `backend/src/app/routes/index.ts`.
- **Reused infra**: `embed()` (`backend/src/app/lib/embeddings.ts`), `chatCompletion()` with `LLM_MODELS.content` (`backend/src/app/lib/llmClient.ts`), cosine similarity helper (currently in `backend/src/app/modules/NewsIngestion/newsIngestion.utils.ts` — will need to be shared rather than duplicated), existing `brand_voice_examples` and `platform_posts` collections/vector indexes (`backend/src/scripts/createVectorIndexes.ts`).
- **Auth/RBAC**: follows the existing team-scoping pattern (`requireAuth`, `req.user.team_ids`) from `[[project-multiteam-rbac]]` — a non-admin caller can only generate content for a team they belong to.
- **Frontend**: `frontend/components/generate/ContentGenerator.tsx` changes from mock lookup to a real API call (loading/error states already partially present via `isGenerating`); `frontend/lib/mock/content.ts` and `findMockContent` are left in place, unused by the live path once wired, until demo day per repo convention.
- **No new dependencies** — reuses OpenRouter client, existing Mongo collections/vector indexes, and existing auth middleware.
