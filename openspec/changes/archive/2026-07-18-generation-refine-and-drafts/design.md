## Context

`generateContent` (post-7A/7B, `contentGeneration.service.ts:108-207`) reads each requested format's cache entry first, only calling the LLM for misses. There is no way for a caller to say "ignore what's cached, generate fresh" — a "Regenerate" button would currently just return the same cached bytes for 24h. There is also no endpoint for lightweight text editing (only full regeneration exists), and no way to persist a draft outside the auto job's `GeneratedContent.create(...)` call in `generatedContent.job.ts` — `generatedContent.route.ts` only exposes `GET /`, `POST /run`, `PATCH /:id`. The `{team_id, news_item_id}` unique+sparse index (`generatedContent.model.ts:35`) would reject a manual save for any pair the auto job already drafted, since it doesn't distinguish `source`.

## Goals / Non-Goals

**Goals:**
- A working regenerate path with simple, predictable semantics (cache bypass + overwrite).
- A cheap, stateless, uncached way to apply a short instruction to existing draft text.
- A manual-save path that never fights the auto job's own dedupe guarantee.
- A safe, scripted migration path for the index change on the live database.

**Non-Goals:**
- Any UI (plan 8's concern).
- Variant/history bookkeeping for regenerated content — last result wins, full stop.
- Refining `youtube_idea` (structured object) — text formats only in v1.
- Auto-persisting every generate/regenerate call as a draft — explicit Save only, to avoid spamming drafts during iteration.
- Per-team generation quotas or rate limiting on refine/regenerate (ops concern, out of scope).

## Decisions

1. **Regenerate = cache bypass + overwrite, no variant bookkeeping.** `payload.regenerate: boolean` on `GenerateContentRequest`. When true, `generateContent` treats every requested format as a cache miss unconditionally (skips the `redis.get` reads entirely — not just ignores their result) and, on success, overwrites each format's existing cache entry exactly as a normal miss would. This is the simplest correct semantics: the UI holds onto anything the user wants to keep, and can persist it via the new Save (manual draft) endpoint if so.

2. **Refine is stateless and uncached — a separate service function and endpoint, not a `generateContent` mode.** Input: `current_text` (1..6000 chars) + `instruction` (1..300 chars) + `format` (text formats only — `youtube_idea` excluded, enforced at validation) + optional `language`/`style_pack_id`. System prompt composition: language instruction (resolved exactly as `generateContent` does, via `resolveVoiceOptions`) + optional style card (pack resolved exactly as `resolveStylePack` does — **examples are deliberately omitted**, since the draft text itself already carries the style; re-injecting few-shot examples would just bloat the prompt without adding signal) + `ANTI_AI_TELL_INSTRUCTION` (reused from `contentGeneration.prompt.ts`) + a fixed editing contract: "Edit the draft per the instruction. Preserve its language, register, and factual claims. Change no more than the instruction requires. Return ONLY the revised text — no markdown fences, no commentary, no labels." User prompt: the draft text plus the instruction. Temperature 0.5 (between generation's 0.7 and extraction's 0.2 — enough freedom to actually change the text, not so much that it drifts from the original). No caching at all — refine is inherently a one-off, input-specific edit; there's no meaningful cache key shape for "this exact draft plus this exact instruction" that would ever hit twice.

3. **Explicit save endpoint, not auto-persist.** `POST /generated-content` — new, alongside the existing `GET /`, `POST /run`, `PATCH /:id`. Body: `{ team_id, news_item_id?, topic (1..300 chars), formats (partial, ≥1 field, each format validated per its own shape — strings for text formats, the structured object for `youtube_idea`), model_used? }`. Server sets `source: 'manual'`, `status: 'draft'`. Reuses the same `assertTeamAccess` pattern already used by `listDrafts`/`updateStatus`/`triggerRun` in `generatedContent.service.ts`, and the `assertHasAtLeastOneFormat` guard already added in change 7A (`generatedContent.utils.ts`). Listed by the existing `GET /generated-content`; status transitions via the existing `PATCH /:id` — no changes needed to either.

4. **Index migration mechanics.** Schema declaration changes from `{ unique: true, sparse: true }` to `{ unique: true, partialFilterExpression: { source: 'auto', news_item_id: { $exists: true } } }`. This preserves the *auto job's* guarantee exactly (only auto-drafted, news-item-linked documents participate in the uniqueness constraint) while making manual saves for the same pair simply not participate in the index at all — no collision, by construction, regardless of how many manual drafts a team saves for the same item. Fresh databases (every test run, via `mongodb-memory-server` building indexes from the current schema) pick this up automatically with no extra step. A **live Atlas deployment does not** — Mongo doesn't retroactively alter an existing index definition; the old sparse-unique index stays in place until explicitly rebuilt. `scripts/syncGeneratedContentIndexes.ts` (mirroring the `dns.setServers` + `mongoose.connect` pattern already used by `createVectorIndexes.ts`/`verifyVectorIndexes.ts`) calls `GeneratedContent.syncIndexes()` — Mongoose's built-in "drop indexes not in the current schema, create indexes that are" — scoped to just this one model's collection, and prints the resulting index list for the operator to eyeball. This is a one-shot, run-once-at-deploy step, not part of any request path.

5. **Auto job dedupe is unaffected by the index change.** `generatedContent.job.ts`'s existing `GeneratedContent.exists({ team_id: tid, news_item_id: newsItemId })` check (no `source` filter) already looks across *both* sources before drafting — this check, not the unique index, is what keeps the auto job from re-drafting an item a team already saved manually. The index change only relaxes what the *database* rejects; the job's own application-level check already had the stronger "any source" semantics the plan wants. No change needed to `generatedContent.job.ts`.

6. **Route placement.** `POST /content/refine` lives in `ContentGeneration`'s router, beside `/generate` (same module — both are single-call LLM operations on the content-generation domain). `POST /generated-content` lives in `GeneratedContent`'s router at `/` (no conflict with the existing `POST /run`, which is a different sub-path).

## Risks / Trade-offs

- **[Regenerate has no cost guard]** → out of scope for this change (ops/quota concern noted as a non-goal in the parent plan); a determined user could regenerate repeatedly. Acceptable at hackathon scale.
- **[Refine could drift the draft's meaning if the instruction is adversarial or vague]** → mitigated by the fixed editing contract ("change no more than the instruction requires," preserve factual claims) but not enforced programmatically — same class of risk as any LLM call, not specific to this feature.
- **[Live index migration requires a manual operator step]** → unavoidable given Mongo's index-mutation model; mitigated by shipping the sync script as this change's own verification step rather than leaving it undocumented.
- **[A team could save unlimited manual draft variants for the same item]** → intentional per Decision 3/4 — "a team may save two variants" is explicitly the point of scoping uniqueness to `source: 'auto'` only.

## Migration Plan

- Schema/index change is backward-compatible for *reads* (existing documents are unaffected); the *index definition* itself requires the one-shot sync script against any live database that already has the old index. Fresh test/dev databases need no manual step.
- No data backfill — existing `GeneratedContent` documents (all `source: 'auto'` today, since no manual-create path existed before this change) remain valid and continue to participate in the (now partial) unique index exactly as before.
- Rollback: revert the schema change and re-run the sync script to restore the old sparse index; any manual drafts created in the interim remain valid documents (the app-level guard, not the index, is what would need to catch a hypothetical future duplicate-auto-draft case post-rollback).

## Open Questions

None — semantics for regenerate, refine, manual save, and the index migration are fully pinned by the plan's design decisions.
