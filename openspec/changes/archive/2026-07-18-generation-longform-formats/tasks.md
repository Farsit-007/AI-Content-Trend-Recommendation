## 1. Format registry & prompts

- [x] 1.1 New `contentGeneration.formats.ts`: `FormatId` union, `CONTENT_FORMATS` registry with the five instruction strings (FB 150-400 words/hook-first; LI 1200-2500 chars/line breaks/3-5 hashtags; caption ≤200 chars; reel scene/VO ~60-90s; youtube_idea JSON shape), `DEFAULT_FORMATS = ['facebook_post','linkedin_post']`
- [x] 1.2 `contentGeneration.prompt.ts`: `ANTI_AI_TELL_INSTRUCTION` const (§Design-4 text); `buildMessages(format, topic, fewShotExamples, voiceOptions, newsContext?, styleContext?)` composes 6B's existing `buildSystemPrompt` blocks + `ANTI_AI_TELL_INSTRUCTION` (text kinds only) + `CONTENT_FORMATS[format].instruction`; delete the all-5 `RESPONSE_SHAPE_INSTRUCTION` const (youtube_idea's JSON contract moves into its registry entry)
- [x] 1.3 `contentGeneration.parse.ts`: `parseTextFormat(raw)` (strip fences, trim, non-empty → string | null) + keep the `isValidYoutubeIdea`-based validator as `parseYoutubeIdea(raw)`; delete `parseGeneratedContent`

## 2. Service

- [x] 2.1 `contentGeneration.interface.ts`: `GeneratedContent`'s five format fields all become optional; `GenerateContentRequest.formats?: FormatId[]`
- [x] 2.2 `contentGeneration.validation.ts`: `formats: z.array(z.enum([...FormatId])).min(1).max(5).optional()` with a `.refine()` for uniqueness, added to `generateContentValidation`
- [x] 2.3 `contentGeneration.service.ts`: restructure `generateContent` to, per requested format: build that format's cache key (extends the existing `buildCacheKey` with a `:${format}` segment); read cache; collect misses; run misses concurrently via `Promise.all` calling `chatCompletion` with `buildMessages(format, ...)`; parse each (`parseTextFormat` or `parseYoutubeIdea` by `CONTENT_FORMATS[format].kind`); any failure → 502, no cache writes; on full success, write each miss's result to its cache key and assemble `{ topic, ...results }`

## 3. Draft model & job

- [x] 3.1 `generatedContent.model.ts`: all `formats` subdoc fields → `required: false`; `generatedContent.interface.ts`'s `IGeneratedContentFormats` fields become optional; add a service-level "≥1 populated format" guard where documents are created
- [x] 3.2 `generatedContent.job.ts`: update the `GeneratedContent.create(...)` call to spread only the formats actually present on `generateContent`'s result (the new default pair) instead of listing all five fields explicitly

## 4. Failover & docs

- [x] 4.1 `lib/llmClient.ts`: at module load, `logger.warn` once when `LLM_MODELS.fallback === LLM_MODELS.content`, naming the consequence; `.env.example` gains a comment on choosing a distinct fallback model
- [x] 4.2 `docs/schemas.ts`: `GenerateContentRequest` gains `language`, `style_pack_id`, `formats`; `GeneratedContent` becomes a partial-formats shape (no fields required except `topic`) reflecting the new response contract; `docs/contentGenerationPaths.ts` request/response descriptions updated accordingly

## 5. Tests

- [x] 5.1 `support/openrouterMock.ts`: add `mockChatCompletionSequence(responses: string[])` (chained `mockResolvedValueOnce`) and `getChatCompletionRequests()` (all recorded call bodies)
- [x] 5.2 Rewrite the existing `contentGeneration.integration.test.ts` happy-path/voice/grounding tests for the new default two-format response shape (sequence-mock two text responses; assert on both calls' prompts via `getChatCompletionRequests`)
- [x] 5.3 New cases: unknown/empty/duplicate/>5 `formats` → 400; `formats: ['youtube_idea']` alone → parsed structured object, no text parsing involved; requesting `caption` after the default pair was already cached → exactly one LLM call; one format's call failing → 502 and no cache write for the whole request
- [x] 5.4 Prompt unit tests (`contentGeneration.prompt.test.ts`): anti-AI-tell instruction present for `facebook_post`/`linkedin_post`/`facebook_reel_script`/`caption`, absent for `youtube_idea`; each format's length/structure directive present in its own call's prompt only
- [x] 5.5 `generatedContent.job.integration.test.ts` (extend the existing file from plan 5): a stored auto-drafted document's `formats` contains exactly `facebook_post` and `linkedin_post`

## 6. Verification

- [x] 6.1 `cd backend && npm test && npm run build`
