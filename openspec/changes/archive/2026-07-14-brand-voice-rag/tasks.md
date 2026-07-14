## 1. Shared utility extraction

- [x] 1.1 Create `backend/src/app/lib/similarity.ts` exporting `cosineSimilarity` (move implementation from `backend/src/app/modules/NewsIngestion/newsIngestion.utils.ts`)
- [x] 1.2 Update `newsIngestion.utils.ts` and `newsIngestion.scoring.ts` to import `cosineSimilarity` from `../../lib/similarity` instead of defining/re-exporting it locally
- [x] 1.3 Run existing NewsIngestion tests/scripts (`verifySemanticDedup.ts`) to confirm no behavior change from the move

## 2. Retrieval layer

- [x] 2.1 Create `backend/src/app/modules/ContentGeneration/contentGeneration.interface.ts` defining `GeneratedContent`, `YoutubeIdea`, `GenerateContentRequest`, and internal `FewShotExample` types matching the spec's response shape
- [x] 2.2 Create `backend/src/app/modules/ContentGeneration/contentGeneration.retrieval.ts`:
  - `fetchTopBrandVoiceExamples(teamId, topicEmbedding, limit=3)` — team-scoped `BrandVoiceExample.find({ team_id })`, rank by `cosineSimilarity`, return top N
  - `fetchTopPerformingPosts(teamId, topicEmbedding, engagementPoolSize=20, limit=3)` — team-scoped `PlatformPost.find({ team_id })`, compute `reach + likes*2 + comments*3 + shares*4`, take top `engagementPoolSize`, rank remainder by similarity, return top N
  - `hasBrandVoiceExamples(teamId)` — `BrandVoiceExample.countDocuments({ team_id }) > 0`, used for the cold-start check
- [x] 2.3 Unit-test retrieval ranking logic with hand-built embeddings/metrics (verify team isolation, top-20-then-top-3 ordering, empty-pool handling)

## 3. Prompt construction and LLM call

- [x] 3.1 Create `backend/src/app/modules/ContentGeneration/contentGeneration.prompt.ts`:
  - `buildSystemPrompt(fewShotExamples, newsContext?)` — generic brand-neutral prompt when `fewShotExamples` is empty (cold start), few-shot-grounded prompt otherwise; instructs strict JSON output matching `GeneratedContent` minus `topic`
  - `buildUserPrompt(topic, newsContext?)` — includes topic text and, when a resolved news item is present, its `category`/`impact_note`
- [x] 3.2 Create `contentGeneration.parse.ts`:
  - `parseGeneratedContent(raw: string): Omit<GeneratedContent, 'topic'> | null` — strip code fences, `JSON.parse`, validate all required keys (`facebook_post`, `facebook_reel_script`, `linkedin_post`, `youtube_idea.{title,hook,chapters,thumbnail_concept}`, `caption`) are present and correctly typed; return `null` on any failure (no partial-object fallback)
- [x] 3.3 Create `contentGeneration.service.ts`:
  - `generateContent(payload: GenerateContentRequest, requestingUser: IRequestUser)`:
    1. `assertTeamAccess(payload.team_id, requestingUser)` (mirror `brandVoiceExample.service.ts`)
    2. Resolve `news_item_id` if provided (soft-fail: log + continue on miss) to get embedding + category/impact_note
    3. Embed `topic` only if no resolved news item embedding is available
    4. Check `hasBrandVoiceExamples(team_id)`; if false, build generic prompt with no retrieval; if true, run both retrieval calls in parallel
    5. Call `chatCompletion({ model: LLM_MODELS.content, messages: [system, user] })`
    6. Parse response via `parseGeneratedContent`; throw `AppError(502, ...)` if parsing fails
    7. Return `{ topic: payload.topic, ...parsed }`

## 4. API surface

- [x] 4.1 Create `contentGeneration.validation.ts` — Zod schema requiring non-empty `team_id`, non-empty `topic`, optional `news_item_id`
- [x] 4.2 Create `contentGeneration.controller.ts` — `generateContent` handler following the `catchAsync`/`sendResponse` pattern used in `brandVoiceExample.controller.ts`
- [x] 4.3 Create `contentGeneration.route.ts` — `router.use(requireAuth)`, `POST /` with validation middleware
- [x] 4.4 Register `{ path: '/content', route: ContentGenerationRoutes }` in `backend/src/app/routes/index.ts`
- [x] 4.5 Add OpenAPI schema + path entries in `backend/src/app/docs/schemas.ts` and a hand-written `contentGenerationPaths.ts` (mirroring `authTeamPaths.ts`'s pattern for non-CRUD endpoints) for `POST /content/generate`

## 5. Frontend wiring

- [x] 5.1 Add a `generateContent(topic, newsItemId)` fetch function inline in `ContentGenerator.tsx`, mirroring `AdminPanel.tsx`'s established inline-fetch convention (no shared `lib/api/` client exists in this codebase yet) — calls `POST /content/generate`. Team scoping uses a `NEXT_PUBLIC_DEFAULT_TEAM_ID` placeholder env var (confirmed with user) since the frontend has no auth/team-selection UI yet; flagged with a TODO for a future real team selector.
- [x] 5.2 Update `frontend/components/generate/ContentGenerator.tsx`'s `handleGenerate` to call the real API instead of `findMockContent`, keeping the existing `isGenerating`/loading UI
- [x] 5.3 Add an error state to `ContentGenerator.tsx` for a failed generation (502/network error) — toast via the existing Sonner `toast`, matching the "fail loudly, don't fabricate" behavior from the design
- [x] 5.4 Confirm `frontend/lib/mock/content.ts` remains unused-but-present (no deletion) per repo convention

## 6. Verification

- [x] 6.1 Manually verify: team with existing `BrandVoiceExample` entries generates content reflecting example tone/style — verified live against Atlas + OpenRouter: a slang-heavy example ("no cap", "fam", emoji-heavy) produced matching tone in the generated post/caption
- [x] 6.2 Manually verify: brand-new team (zero `BrandVoiceExample`) still generates content via the generic prompt path — verified live: freshly created team with no examples generated full, correctly-shaped content
- [x] 6.3 Manually verify: request with a valid `news_item_id` reuses its embedding (no extra embed call) and reflects its category/impact_note in output tone — verified live against a real ingested `NewsItem` (DevOps category); output included a `#DevOps` tag
- [x] 6.4 Manually verify: request with an invalid `news_item_id` still succeeds (soft-fail path) — verified live: a non-existent ObjectId still returned HTTP 200 with generated content
- [x] 6.5 Manually verify: non-admin user cannot generate content for a `team_id` outside their `team_ids` (403) — verified live with a real non-member user account
- [x] 6.6 Run backend typecheck/build and confirm no regressions in `NewsIngestion` after the `cosineSimilarity` move — `tsc --noEmit` clean; `verify:semantic-dedup` and new `verify:content-generation-retrieval` scripts both pass

**Bug found and fixed during verification**: `assertTeamAccess` in `contentGeneration.service.ts` initially mirrored `brandVoiceExample.service.ts`'s check (`role === 'admin'` only), which doesn't recognize `super_admin` — inconsistent with the canonical `requireTeamAccess` middleware in `auth.ts` (which allows both `admin` and `super_admin`). Fixed in this module. Note: `brandVoiceExample.service.ts` itself still has this same gap (reproduced live: a super_admin got 403 creating/listing brand-voice examples) — pre-existing, out of scope for this change, flagged for a follow-up fix.
