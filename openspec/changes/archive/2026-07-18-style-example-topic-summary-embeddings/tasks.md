## 1. Config

- [x] 1.1 `config/index.ts` raw env schema: `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY: z.string().default('false')`
- [x] 1.2 `config/index.ts` derived config: new `style_packs: { embed_examples_by_topic_summary: env.STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY === 'true' }` section (no existing section was a natural fit — `content_generation` is ContentGeneration-module-specific; a new `style_packs` section matches the established one-section-per-module pattern)
- [x] 1.3 `.env.example`: documented under a new "Style packs" section, explicitly framed as a ready-but-inactive Gate G1 fallback, not a default-on feature

## 2. Model & interface

- [x] 2.1 `stylePack.interface.ts`: `IStyleExample` gains `embedding_source: 'content' | 'topic_summary'` and `topic_summary?: string`
- [x] 2.2 `stylePack.model.ts`: corresponding schema fields on `styleExampleSchema` — `embedding_source` enum with `default: 'content'`, `topic_summary` plain string

## 3. Summary extraction

- [x] 3.1 New file `stylePack.embeddingStrategy.ts`: `extractTopicSummary(content): Promise<string | null>` — one `LLM_MODELS.standard` call, low temperature, soft-fails to `null` on any error or empty response
- [x] 3.2 `resolveExampleEmbedding(content): Promise<ResolvedExampleEmbedding>` — flag-gated single-item resolution per design.md decision 3
- [x] 3.3 `resolveExamplesEmbeddingBatch(contents): Promise<ResolvedExampleEmbedding[]>` — **sequential** summary extraction (not `Promise.all`) to avoid flooding OpenRouter with up-to-100 concurrent chat-completion calls, matching this codebase's established concurrency-safety precedent (`lib/embeddings.ts`'s own `embedBatch` warning, `newsIngestion.contentFetch.ts`'s bounded-concurrency pattern) — this is a deliberate deviation from a literal reading of the task, which didn't specify the mechanism; one `embedBatch` call still covers all items regardless of extraction outcome

## 4. Service & script wiring

- [x] 4.1 `stylePack.service.ts`: `addExample` uses `resolveExampleEmbedding`; a caller-supplied `payload.embedding` still bypasses extraction entirely (tagged `'content'`), matching pre-existing behavior for that path
- [x] 4.2 `stylePack.service.ts`: `addExamplesBulk` uses `resolveExamplesEmbeddingBatch`
- [x] 4.3 `scripts/seedStylePack.ts`: same batch resolver, replacing its direct `embedBatch` call
- [x] 4.4 Backfill implemented as `backfillMissingEmbeddingSource()` (exported, testable), run as the first step of the migration script (task 5) rather than a separate startup hook — collection-wide, idempotent, matches the `newsRetention.service.ts` `lifecycle` precedent exactly

## 5. Migration script

- [x] 5.1 Core logic extracted into `stylePack.embeddingStrategy.ts` as `migrateExamplesForPack(packId)` (mirrors the 9A `generateStyleCard.ts` thin-wrapper-around-testable-service pattern, per a design note added to design.md's spirit but decided at implementation time for testability — task 7.3 needs a unit-testable core, not just a CLI entry point); `scripts/migrateStyleExampleEmbeddings.ts` is now a thin wrapper calling `backfillMissingEmbeddingSource()` then `migrateExamplesForPack(packId)`
- [x] 5.2 Registered `migrate:style-example-embeddings` npm script

## 6. Retrieval verification script update

- [x] 6.1 `scripts/verifyStylePackRetrieval.ts`: projects and prints `embedding_source` per ranked example (falls back to `'content'` in the printed label for pre-existing rows that predate the field, without requiring the backfill to have run first)

## 7. Tests

- [x] 7.1 `stylePack.embeddingStrategy.test.ts` (new, 13 tests): `extractTopicSummary` soft-fail (LLM error, empty response, valid response); `resolveExampleEmbedding` flag off/on/on-with-failure; `resolveExamplesEmbeddingBatch` flag off/on/on-with-one-item-failing-independently
- [x] 7.2 `stylePack.integration.test.ts` (extended, +3 tests): flag off → single add byte-identical to pre-change (embedding_source 'content', zero chat-completion calls); flag on → single add gets `embedding_source: 'topic_summary'` + persisted summary; flag on → bulk import tags every created example correctly
- [x] 7.3 Migration logic tests (in `stylePack.embeddingStrategy.test.ts`): `backfillMissingEmbeddingSource` backfills a manually-inserted pre-existing row and is a no-op on a second run; `migrateExamplesForPack` migrates candidates and skips already-migrated rows; re-running against a fully-migrated pack touches zero rows and makes zero LLM/embedding calls; an extraction failure leaves that row's embedding/marker untouched while a sibling row in the same run still migrates successfully. **Bug found and fixed while writing this test**: the migration query had no explicit sort, so which candidate hit which mocked LLM response was nondeterministic under MongoDB's unguaranteed natural order — surfaced as a real (if rare) test flake when run inside the full suite. Fixed by adding `.sort('_id')` to `migrateExamplesForPack`'s candidate query, which also makes the actual production migration script's per-run behavior reproducible, not just the test.
- [x] 7.4 `cd backend && npm test && npm run build` — 398/398 tests pass (confirmed stable across 3 consecutive full-suite runs after the sort fix), build clean

## 8. Verification

- [x] 8.1 `cd backend && npm test` — 398/398 pass
- [x] 8.2 `cd backend && npm run build` — clean
- [x] 8.3 Live check: seeded a scratch pack (flag off/default) against real Atlas/OpenRouter — confirmed via `verify:style-pack-retrieval`'s new marker output that both examples stored `embedding_source: content`, with sensible topical ranking.
- [x] 8.4 Live check: temporarily set `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY=true`, added a brand-new example via `seed:style-pack` — confirmed `embedding_source: topic_summary` and inspected the actual persisted summary text, which was a fluent, accurate English description of the Bangla post's real content (e.g. "Writing code with AI tools has become commonplace, but comprehending and debugging AI-generated code remains a uniquely human capability" for a post about exactly that). Confirms the extraction quality bar, not just that a string got stored.
- [x] 8.5 Live check: ran `migrate:style-example-embeddings` against the same scratch pack's 2 pre-existing (flag-off-created) examples — both correctly re-embedded to `topic_summary` with accurate summaries; a second run correctly reported "nothing to migrate" (0 processed). The collection-wide backfill step also ran and picked up 4 other pre-existing rows from earlier in the session, exactly as designed — confirms both the migration and backfill mechanisms work correctly end-to-end against real infrastructure. Flag reverted to unset (default false) and scratch pack cleaned up afterward.
- [x] 8.6 Explicitly out of scope for this change's verification (per design.md Open Questions and proposal.md's Why): actually running Gate G1 to determine whether this fallback is needed at all — that requires a real Track-0 corpus and a recorded human verdict, tracked separately as the parent plan's Gate G1
