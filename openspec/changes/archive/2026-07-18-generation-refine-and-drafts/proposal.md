## Why

Changes 7A/7B gave generation real per-format structure and fact-grounding, but the vision's "click-tweak-copy loop" (V9/V10) has no backend support yet: there is no way to force a fresh regeneration (cache always wins for 24h), no way to apply a quick instruction-based tweak to a draft ("shorter", "more casual", "stronger hook"), and no way to persist a manually-reviewed draft — only the auto-generation job ever writes a `GeneratedContent` document. This change completes that loop's backend.

## What Changes

- `POST /content/generate` gains `regenerate: boolean` — when true, per-format cache reads are skipped for the requested formats and successful fresh output overwrites the existing cache entries. No variant bookkeeping — the last result simply wins the cache slot.
- New `POST /content/refine` — `{ team_id, format (text formats only), current_text, instruction, language?, style_pack_id? }` → one **uncached** LLM call that edits the draft per the instruction while preserving its language and register, returning `{ revised_text }`. Powers tweak chips like "shorter"/"more casual"/"stronger hook". `youtube_idea` is excluded (structured object, not a text rewrite — v1 refines text formats only).
- New `POST /generated-content` — creates a `source: 'manual'`, `status: 'draft'` document (team-access-gated, at least one format populated). This is the UI's explicit "Save" action, not an auto-persist on every generate/regenerate.
- The `{team_id, news_item_id}` unique index on `GeneratedContent` becomes a **partial unique index scoped to `source: 'auto'`**, so a manual save for a pair the auto job already drafted never collides — while the auto job's own dedupe (its `alreadyDrafted` check, which already queries by pair regardless of source) still prevents it from re-drafting an item a team saved manually.
- Ships a one-shot `scripts/syncGeneratedContentIndexes.ts` (`npm run db:sync-generated-content-indexes`) to migrate the live Atlas index, since fresh test databases build the new index automatically but a live deployment keeps its old sparse-unique index until synced.

## Capabilities

### Modified Capabilities
- `content-generation-cache`: the existing "Generated content is cached in Redis for 24 hours" requirement gains a `regenerate` bypass-and-overwrite behavior.

### New Capabilities (delta additions to existing capabilities)
- `content-generation`: new "Instruction-Based Draft Refinement" requirement (`POST /content/refine`).
- `generated-content`: new "Manual Draft Persistence" requirement (`POST /generated-content`, plus the index migration that makes it safe alongside the auto job).

## Impact

- Backend: `contentGeneration.interface.ts`/`.validation.ts`/`.service.ts`/`.controller.ts`/`.route.ts` (regenerate flag; new refine endpoint); `contentGeneration.prompt.ts` (`buildRefineMessages`); `contentGeneration.formats.ts` (text-only format id list for refine validation); `generatedContent.interface.ts`/`.validation.ts`/`.service.ts`/`.controller.ts`/`.route.ts` (new create-draft endpoint); `generatedContent.model.ts` (partial unique index); new `scripts/syncGeneratedContentIndexes.ts`; `docs/` schemas and paths for both new endpoints.
- Depends on changes 7A (`generation-longform-formats`) and 7B (`generation-facts-then-write`), both already applied.
- No frontend changes (the click-tweak-copy UI itself is plan 8's concern; this change ships only the backend it needs).
