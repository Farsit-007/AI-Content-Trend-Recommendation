## 1. Interface & validation

- [x] 1.1 `contentGeneration.interface.ts`: `GenerateContentRequest.style_pack_id?: string`; `FewShotExample.source` gains `'style_pack_example'`
- [x] 1.2 `contentGeneration.validation.ts`: `style_pack_id: objectId.optional()` added to `generateContentValidation`

## 2. Retrieval & resolution

- [x] 2.1 `contentGeneration.retrieval.ts`: `fetchTopStyleExamples(packId, topicEmbedding, limit = 5)` — fetches `StyleExample.find({ style_pack_id: packId }, { content: 1, embedding: 1, engagement_hint: 1 })` and ranks via the existing pure cosine ranker, mapped to `source: 'style_pack_example'`
- [x] 2.2 `contentGeneration.service.ts`: `resolveStylePack(requestPackId, teamId)` — fetch the request-supplied pack by id if `is_active`, else the team's `default_style_pack_id` pack if `is_active`, else `null`; any miss/inactive logs `logger.warn` and returns `null`; parallelize inside the existing `Promise.all` alongside `resolveNewsItemContext` and `resolveVoiceOptions`

## 3. Prompt

- [x] 3.1 `contentGeneration.prompt.ts`: `buildSystemPrompt(fewShotExamples, voiceOptions, styleContext?)` where `styleContext = { card?: string; examples: FewShotExample[] }`; exact block order per design (role → voice → style card → style examples → team examples (relabeled) → grounding → response shape); cold-start condition becomes `fewShotExamples.length === 0 && !styleContext`; `buildMessages` threads `styleContext` through to `buildSystemPrompt`

## 4. Cache key

- [x] 4.1 `contentGeneration.service.ts`: `buildCacheKey(teamId, newsItemId, topic, language, packId)` → `` `content:${teamId}:${item}:${language}:${packId ?? 'none'}` ``; restructure `generateContent` so voice/pack resolution happens before the cache key is built (both the cache-read and cache-write call sites move after resolution)

## 5. Style-card script

- [x] 5.1 New `backend/src/scripts/generateStyleCard.ts` + npm script `style:generate-card` (`npm run style:generate-card -- <slug>`): load pack examples, cap total input ~15k chars (evenly sample when larger), one `chatCompletion({ model: LLM_MODELS.standard, temperature: 0.3, messages })` with the fixed analysis instruction (tone & register; sentence rhythm; hook patterns; emoji policy; Bangla/English code-switch habits; CTA habits; 3 things this style never does); persist to `pack.style_card` via `StylePack.findByIdAndUpdate`; print the card; register the npm script in `backend/package.json`

## 6. Tests

- [x] 6.1 Prompt unit tests (`contentGeneration.prompt.test.ts`): style block order (card before examples before team examples); no-pack call sites byte-identical output to current expectations; pack-without-card renders examples only (no card line); cold-start-with-pack uses the styled branch, not brand-neutral
- [x] 6.2 Integration (`contentGeneration.integration.test.ts`): create a pack + example (mock embeds), team `default_style_pack_id` set → system prompt (via `getLastChatCompletionRequest`) contains the example text; request `style_pack_id` override wins over team default; dangling/inactive pack → 200 response with no style block, warning logged
- [x] 6.3 Cache test: same team+item, `language: 'bangla'` then `language: 'english'` → two distinct `chatCompletion` calls (assert call count 2), two distinct returned outputs; same team+item, no pack then with `style_pack_id` → two distinct calls

## 7. Verification

- [x] 7.1 `cd backend && npm test && npm run build`
