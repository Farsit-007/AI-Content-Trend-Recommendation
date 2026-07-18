## 1. Regenerate

- [x] 1.1 `contentGeneration.interface.ts`: `GenerateContentRequest.regenerate?: boolean`
- [x] 1.2 `contentGeneration.validation.ts`: `regenerate: z.boolean().optional()` added to `generateContentValidation`
- [x] 1.3 `contentGeneration.service.ts`: in `generateContent`, when `payload.regenerate` is true, skip the per-format `redis.get` reads entirely (treat every requested format as a miss) so the existing miss-handling path (concurrent calls, all-or-nothing parse, per-format cache write) naturally overwrites each requested format's cache entry on success

## 2. Refine

- [x] 2.1 `contentGeneration.formats.ts`: export `TEXT_FORMAT_IDS` (the `FormatId`s whose `kind === 'text'`, i.e. all except `youtube_idea`)
- [x] 2.2 `contentGeneration.interface.ts`: `RefineContentRequest { team_id: string; format: FormatId; current_text: string; instruction: string; language?: LanguageStyle; style_pack_id?: string }`
- [x] 2.3 `contentGeneration.validation.ts`: `refineContentValidation` — `team_id` objectId, `format` restricted to `TEXT_FORMAT_IDS`, `current_text` 1..6000 chars, `instruction` 1..300 chars, `language`/`style_pack_id` optional as in generate
- [x] 2.4 `contentGeneration.prompt.ts`: `buildRefineMessages(currentText, instruction, voiceOptions, styleCard?)` — system prompt: intro line + voice instructions + optional `How this style writes:\n<card>` block + `ANTI_AI_TELL_INSTRUCTION` + the fixed editing contract (verbatim per §Design-2); user prompt: draft + instruction
- [x] 2.5 `contentGeneration.service.ts`: `refineContent(payload, requestingUser)` — `assertTeamAccess`; resolve `voiceOptions`/`stylePack` in parallel exactly as `generateContent` does; call `buildRefineMessages` with `stylePack?.style_card` (examples omitted); one `chatCompletion({ model: LLM_MODELS.content, messages, temperature: 0.5 })`; `parseTextFormat` the result; 502 on LLM failure or empty parse; return `{ revised_text }`
- [x] 2.6 `contentGeneration.controller.ts` + `contentGeneration.route.ts`: `POST /content/refine` behind `requireAuth` + `validation(refineContentValidation)`

## 3. Manual drafts & index

- [x] 3.1 `generatedContent.validation.ts`: `createDraftValidation` — `team_id` objectId, `news_item_id` optional objectId, `topic` 1..300 chars, `formats` object with per-field shape validation (strings for text formats, the structured object for `youtube_idea`) refined to require at least one populated field, `model_used` optional string
- [x] 3.2 `generatedContent.service.ts`: `createDraft(payload, requestingUser)` — `assertTeamAccess`, `assertHasAtLeastOneFormat` (reuse from `generatedContent.utils.ts`), `GeneratedContent.create({ ...payload, source: 'manual', status: 'draft' })`
- [x] 3.3 `generatedContent.controller.ts` + `generatedContent.route.ts`: `POST /generated-content` behind `requireAuth` + `validation(createDraftValidation)` (team access enforced in service, matching the module's existing pattern)
- [x] 3.4 `generatedContent.model.ts`: change the `{team_id, news_item_id}` index to `{ unique: true, partialFilterExpression: { source: 'auto', news_item_id: { $exists: true } } }` (drop `sparse: true`)
- [x] 3.5 New `backend/src/scripts/syncGeneratedContentIndexes.ts` (`npm run db:sync-generated-content-indexes`): `dns.setServers` + `mongoose.connect`, call `GeneratedContent.syncIndexes()`, print the resulting index list; register the npm script in `backend/package.json`

## 4. Docs

- [x] 4.1 `docs/schemas.ts`: `GenerateContentRequest` gains `regenerate`; new `RefineContentRequest`/`RefineContentResponse` schemas; new `CreateDraftRequest` schema
- [x] 4.2 `docs/contentGenerationPaths.ts`: new `/content/refine` path entry
- [x] 4.3 `docs/generatedContentPaths.ts`: new `POST /generated-content` path entry

## 5. Tests

- [x] 5.1 Regenerate (`contentGeneration.integration.test.ts`): a cached format + `regenerate: true` → a new LLM call occurs (call count), and the cache is overwritten (a subsequent plain request without `regenerate` returns the new text with zero further calls); `regenerate: true` on one format leaves a sibling cached format untouched
- [x] 5.2 Refine integration (new or extended test file): happy path (mocked revision returned, `revised_text` in response, zero cache/Redis side effects); `format: 'youtube_idea'` → 400; a user outside the team → 403; `current_text`/`instruction` exceeding their bounds → 400; resolved style pack's card appears in the prompt, its examples do not
- [x] 5.3 Prompt unit tests (`contentGeneration.prompt.test.ts`): `buildRefineMessages` includes language instruction, style card when present, anti-AI-tell instruction, and the fixed editing contract; omits style examples even when the pack has them
- [x] 5.4 Manual drafts (new or extended `generatedContent` integration test): a manual save for a pair the auto job already drafted succeeds and both appear in `GET /generated-content`; a second manual save for the same pair also succeeds (no unique-index rejection); a direct duplicate `source: 'auto'` insert for the same pair still rejects (duplicate key error, proving the partial index still protects the auto job); a topic-only manual draft (no `news_item_id`) saves; a draft with no populated formats → 400; a non-member → 403

  **Note:** "both appear in `GET /generated-content`" verified directly against the collection instead of via HTTP — see the note in the test file about the pre-existing `validation()` middleware bug that 400s that endpoint regardless of query params sent.

## 6. Verification

- [x] 6.1 `cd backend && npm test && npm run build`
