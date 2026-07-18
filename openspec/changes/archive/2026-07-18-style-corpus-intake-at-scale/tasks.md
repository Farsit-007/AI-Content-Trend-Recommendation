## 1. Model & interface

- [x] 1.1 `stylePack.interface.ts`: add `style_card_generated_at?: Date` and `style_card_example_count?: number` to `IStylePack`
- [x] 1.2 `stylePack.model.ts`: add the two corresponding optional fields to the pack schema

## 2. Card service extraction

- [x] 2.1 Move `sampleWithinBudget`, `ANALYSIS_INSTRUCTION`, and the card-generation `chatCompletion` call from `scripts/generateStyleCard.ts` into `stylePack.service.ts` as `generateCardForPack(packId): Promise<string>` — throws `AppError(NOT_FOUND)` for a missing pack, `AppError(BAD_REQUEST)` for zero examples; persists `style_card`, `style_card_generated_at: new Date()`, `style_card_example_count: <examples used>`; returns the card text
- [x] 2.2 Rewrite `scripts/generateStyleCard.ts` as a thin CLI wrapper: keep the `dns.setServers`/`mongoose.connect` boilerplate and arg parsing, call `StylePackService.generateCardForPack`, print the result, disconnect
- [x] 2.3 Confirm existing behavior is unchanged by running the script manually against a scratch pack with examples (same console output shape as before the refactor) — live-verified: connects, resolves the pack, calls the shared service, and fails cleanly (no partial write) when OpenRouter's free-tier daily rate limit was hit; error handling behaves identically to pre-refactor

## 3. Bulk import endpoint

- [x] 3.1 `stylePack.validation.ts`: add a bulk-create schema — array of the existing single-example shape, `min(1).max(100)`
- [x] 3.2 `stylePack.service.ts`: `addExamplesBulk(packId, items)` — normalize each item's `content` (`trim().replace(/\s+/g, ' ')`); build a de-dup set from the pack's existing example contents (normalized) plus items already accepted within this batch; for surviving items, call `embedBatch(contents)` once, then `StyleExample.insertMany(...)`; return `{ created, skipped, total }`
- [x] 3.3 `stylePack.controller.ts` + `stylePack.route.ts`: `POST /:id/examples/bulk` behind `requireAuth, requireSuperAdmin`
- [x] 3.4 `stylePack.controller.ts` + `stylePack.route.ts`: `POST /:id/generate-card` behind `requireAuth, requireSuperAdmin`, calling `generateCardForPack`
- [x] 3.5 `stylePack.service.ts`: extend `getPackById` (and the list response, if packs are read with these fields elsewhere) to include `style_card_generated_at` and `style_card_example_count` — satisfied automatically: both return the full Mongoose document, which now includes the new schema fields

## 4. Seed script alignment

- [x] 4.1 `scripts/seedStylePack.ts`: replace the per-item `embed()` + exact-match dedup with the same whitespace-normalization dedup rule and `embedBatch` (chunked at ≤100 items per call) used by the new bulk endpoint
- [x] 4.2 Verify `seed:style-pack` re-run against an already-seeded file still reports all-skipped with zero new examples created — live-verified against real Atlas: first run `2 created, 0 skipped`, second run `0 created, 2 skipped`; also required adding the `dns.setServers` fix (established convention in sibling scripts) since this script had never had it and this machine can't resolve `mongodb+srv://` SRV records without it

## 5. API documentation

- [x] 5.1 `docs/stylePackPaths.ts`: document `POST /:id/examples/bulk` and `POST /:id/generate-card` (request/response shapes, 403 for non-super_admin)
- [x] 5.2 `docs/schemas.ts`: add/extend schemas for the bulk request/response and the pack read shape's new fields
- [x] 5.3 Confirm both new paths are wired into `docs/openapi.ts` and render in the Swagger UI — both new schemas and paths registered in `openapi.ts`'s `components.schemas`/`paths`; `tsc` build is clean confirming no broken `$ref`s. Actual browser rendering of `/api/v1/docs` not visually inspected (no interactive browser available in this session) — the registration is mechanically identical to every other already-working path in this file, so this is low-risk, but worth a 30-second human glance.

## 6. Frontend — super-admin Style Packs page

- [x] 6.1 `frontend/src/lib/api/stylePacks.ts`: add `bulkAddExamples(packId, items)` and `generateCard(packId)`; extend `StylePackDto` with `style_card`, `style_card_generated_at`, `style_card_example_count`
- [x] 6.2 `frontend/src/pages/dashboard/admin/StylePacks.tsx` (`PackExamples`): add a bulk-import control — textarea or file input accepting a pasted/dropped JSON array, client-side shape validation before submit, call `bulkAddExamples`, toast reporting `created`/`skipped`; keep the existing single-paste-and-add flow unchanged alongside it
- [x] 6.3 `frontend/src/pages/dashboard/admin/StylePacks.tsx` (`PackRow` expanded view): add a style-card panel — card text (collapsible if long), "Generated <date> from <n> examples" (or "Never generated"), a stale indicator when `example_count !== style_card_example_count` or the card is absent, and a "Regenerate card" button with a pending/loading state calling `generateCard`

## 7. Fold-in fix (auto-generation lifecycle filter)

- [x] 7.1 `generatedContent.job.ts`: add `lifecycle: 'active'` to the `NewsItem.find({...})` filter in `runAutoGeneration`, removing the stale seam comment
- [x] 7.2 Add or extend an integration test asserting an archived `NewsItem` is not selected as an auto-generation candidate

## 8. Tests

- [x] 8.1 `stylePack.integration.test.ts`: bulk-import happy path, asserting exactly one embeddings call is made for the batch (via the existing openrouter mock's call-count/assertions)
- [x] 8.2 `stylePack.integration.test.ts`: bulk-import normalized-dedup — both against existing pack examples and within the same batch
- [x] 8.3 `stylePack.integration.test.ts`: bulk-import rejects a 101-item batch and an item with invalid shape, creating nothing
- [x] 8.4 `stylePack.integration.test.ts`: bulk-import and generate-card both return 403 for admin/regular-user callers
- [x] 8.5 `stylePack.integration.test.ts`: generate-card stamps `style_card_generated_at`/`style_card_example_count`; zero-example pack returns a client error and leaves the pack unchanged
- [x] 8.6 `generatedContent.job.integration.test.ts` (or equivalent): archived news item is excluded from auto-generation candidates (task 7.2)

## 9. Verification

- [x] 9.1 `cd backend && npm test` — 38 suites, 326 tests, all pass
- [x] 9.2 `cd backend && npm run build` — clean
- [x] 9.3 `cd frontend && npm run build` — clean
- [x] 9.4 `cd frontend && npm run lint` — clean for every file this change touched; 3 pre-existing errors + 1 warning remain in unrelated files (`VoiceProfileSection.tsx`, `TourOverlay.tsx`, `sidebar.tsx`, `use-mobile.ts`) that this change did not introduce and did not modify
- [x] 9.5 Live check (CLI-equivalent, no browser available this session): `seed:style-pack` against a scratch pack via the real API path exercised the same service code the bulk-import UI calls — first run `2 created, 0 skipped`, re-run `0 created, 2 skipped`. The UI's own request/response handling is additionally covered by `stylePack.integration.test.ts`'s bulk-import suite (created/skipped counts, single-embeddings-call assertion). Actual browser click-through not performed — recommend a quick manual pass before this ships to a real curator.
- [x] 9.6 Live check (partial): `style:generate-card` (the same code path as the "Regenerate card" button) against the scratch pack confirmed clean connect → resolve → call → fail-without-partial-write behavior when OpenRouter's free-tier daily rate limit was hit (external constraint, not a code issue). The success path (card text + metadata persisted, staleness becomes derivable) is covered by `stylePack.integration.test.ts`'s style-card-generation suite (mocked LLM) but was not observed live end-to-end due to the rate limit. Re-run live once the OpenRouter quota resets, or against a paid/alternate key, to see the UI panel populate for real.
- [x] 9.7 Live check: covered by the new `generatedContent.job.integration.test.ts` case (archived item excluded, real HTTP request through `POST /generated-content/run`, only the LLM/embeddings calls are mocked) — equivalent to triggering the admin endpoint against a real archived item. Not additionally re-run against the live Atlas DB since the integration test already exercises the exact same Mongoose query this task is checking.
