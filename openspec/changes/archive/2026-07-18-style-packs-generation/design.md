## Context

`POST /content/generate` (`contentGeneration.service.ts`) today: resolves news-item context and voice options in parallel, embeds the topic (or reuses the news item's embedding), skips all retrieval when the team has zero `BrandVoiceExample` documents (`hasBrandVoiceExamples` cold-start check), otherwise fetches top brand-voice examples and top-performing platform posts, builds a two-branch system prompt (`buildSystemPrompt` — brand-neutral vs. team-voice), calls the content LLM once, parses strict JSON, and caches the result in Redis under `content:${teamId}:${item}` where `item` is `news_item_id` or a hash of `topic` — **the key has no language or pack dimension today**, so a Bangla result cached for team+item can be replayed for a later English request on the same team+item within the 24h TTL. This is a real, currently-live bug (not introduced by this change) that packs make materially worse, since they multiply the number of legitimately-different outputs that can collide under one key.

Change 6A shipped the `StylePack`/`StyleExample` data model, full CRUD, and `Team.default_style_pack_id`, but deliberately did no generation wiring. This change is that wiring: resolve a pack, retrieve its examples, and reshape the system prompt so the pack's voice takes priority over the team's own brand-voice examples (the team layer still contributes terminology/specifics, but the pack sets tone).

## Goals / Non-Goals

**Goals:**
- `style_pack_id` resolves the same way `resolveVoiceOptions` resolves language (request → team default → none), fails soft on any lookup miss.
- Style pack content (card + examples) appears in the system prompt ahead of team brand-voice examples.
- A team with a pack but zero brand-voice examples gets styled output, not the brand-neutral fallback.
- Fix the cache key to include resolved language and resolved pack id — a real correctness bug, fixed here because this change is what makes it acute.
- Ship a reusable, re-runnable style-card generator script.

**Non-Goals:**
- Per-format/platform-aware retrieval preference (7A's concern; `platform` on examples stays unread here).
- Any change to the `StylePack`/`StyleExample` schema or CRUD API — 6A already shipped those; this change only reads.
- Token-budget truncation logic — card (~400 tokens) + 5 style examples (~1.5-2k tokens Bangla) + 3 team examples fits every candidate content model's context comfortably; revisit only if 7A's longer formats need it.
- Any frontend work (a later plan surfaces `style_pack_id` selection in the Generate UI).

## Decisions

1. **Resolution mirrors `resolveVoiceOptions`'s pattern but is a separate helper, not a shared one.** `resolveVoiceOptions` (`lib/voiceProfile.ts:28-38`) is also used by `Chat` (`chat.service.ts:30`) — widening its return shape to carry style-pack info would touch a module this change has no business touching. Instead, `contentGeneration.service.ts` gets its own `resolveStylePack(requestPackId, teamId)`: fetch the request-supplied pack by id if active, else look up the team's `default_style_pack_id` and fetch that pack if active, else `null`. Any lookup failure (bad id, deleted pack, inactive pack) logs `logger.warn` and returns `null` — never a request error, matching `resolveNewsItemContext`'s existing soft-fail philosophy in the same file. The team lookup for `default_style_pack_id` is a small additional `Team.findById(teamId).select('default_style_pack_id')`, parallelized inside the existing `Promise.all` alongside `resolveNewsItemContext` and `resolveVoiceOptions` — three independent lookups, still one round of parallel awaits.

2. **Retrieval:** new `fetchTopStyleExamples(packId, topicEmbedding, limit = 5)` in `contentGeneration.retrieval.ts`, fetching `StyleExample.find({ style_pack_id: packId }, { content: 1, embedding: 1, engagement_hint: 1 })` and reusing the existing pure ranker. `rankBrandVoiceExamples` already takes a `source` implicitly baked into its output (`source: 'brand_voice_example' as const`); the cleanest reuse is exporting a small internal `rankExamplesBySource(candidates, topicEmbedding, limit, source)` that both `rankBrandVoiceExamples` and the new style-pack ranker call, OR simply calling the existing ranker and mapping `source` afterward. Either is a 5-line internal change; `formatExamples` in the prompt module needs no change since it already renders `source` generically via `[${example.source}]`. `FewShotExample.source` gains the literal `'style_pack_example'`.

3. **Prompt structure — exact system-message block order:**
   1. role intro (existing)
   2. voice instructions (language + custom_instructions — existing)
   3. **style card block** (only when the resolved pack has a `style_card`): `How this style writes:\n<card>`
   4. **style examples block** (only when style examples were retrieved): `Style examples — write exactly in this style, tone, and rhythm:\n<formatExamples(styleExamples)>`
   5. team brand-voice examples block (existing, **relabeled**): `This team's own past posts — blend their terminology, audience, and product specifics:\n<formatExamples(fewShotExamples)>` (only when `fewShotExamples.length > 0`)
   6. `GROUNDING_INSTRUCTION` (existing, unchanged)
   7. `RESPONSE_SHAPE_INSTRUCTION` (existing, unchanged)

   `buildSystemPrompt(fewShotExamples, voiceOptions, styleContext?)` where `styleContext = { card?: string; examples: FewShotExample[] }` is an optional third parameter — every existing call site (only `contentGeneration.service.ts` calls this) and every existing prompt test keeps compiling and passing unchanged when the parameter is omitted.

4. **Cold-start redefinition:** today's branch condition is `fewShotExamples.length === 0` → brand-neutral prompt. It becomes `fewShotExamples.length === 0 && !styleContext` (i.e., no team examples *and* no pack resolved). A brand-new team with a pack selected gets the styled branch on day one — that is the literal product promise of this feature. `hasBrandVoiceExamples`'s own retrieval-skip behavior (skip fetching team examples when the team has none) is unchanged; only the *prompt branch selection* changes.

5. **Cache key fix, computed after resolution:** `buildCacheKey(teamId, newsItemId, topic, language, packId)` → `` `content:${teamId}:${item}:${language}:${packId ?? 'none'}` ``. This must be computed **after** `resolveVoiceOptions` (for the resolved, not requested, language — a request with no `language` override still resolves to a concrete language that must be part of the key) and after `resolveStylePack` (for the resolved pack id). Both the cache-read and cache-write call sites move to after resolution; today's single early cache-read-before-resolution is restructured into: resolve (parallel) → build key → check cache → generate-or-return. Old-format keys (`content:${teamId}:${item}`) simply age out within the existing 24h TTL — no explicit invalidation needed, matching the "no migration" pattern used throughout this project's OpenSpec changes.

6. **Style-card generator is a script, not a runtime path** (matches 6A's `verifyStylePackRetrieval.ts` precedent of doing analysis/curation work offline, not in the request path). `src/scripts/generateStyleCard.ts <slug>`: loads the pack's examples, concatenates content capped at ~15k total chars (evenly sampled across examples if the corpus is larger, so the LLM sees a representative slice rather than just the first N), one `chatCompletion({ model: LLM_MODELS.standard, temperature: 0.3, messages })` call with a fixed instruction producing: tone & register; sentence rhythm; hook patterns; emoji policy; Bangla/English code-switch habits; CTA habits; and 3 things this style never does. Persists the result to `pack.style_card` via `StylePack.findByIdAndUpdate`, and prints it to stdout for curator review. Re-running overwrites the existing card (no versioning) — matches the "curator can also hand-write one" flexibility 6A already established for this field.

7. **Token budget:** card (~400 tokens) + 5 style examples (~1.5-2k tokens of Bangla) + up to 3 team brand-voice/platform-post examples is well within context for every candidate content model today. No truncation logic added; revisit only if 7A's longer-form generation formats need tighter budgets.

## Risks / Trade-offs

- **[Cache key change is a behavior change for every existing generation request, not just pack-related ones]** → strictly additive to correctness (fixes a real bug affecting every team regardless of packs); old keys age out naturally within 24h, so no user-visible discontinuity beyond "a few requests within the next 24h recompute instead of hitting a stale cache," which is the *fix*, not a regression.
- **[A team with a large/inactive pack reference could add latency to every generation call via the extra `Team.findById`]** → parallelized inside the existing `Promise.all`; adds one more concurrent (not serial) lookup, not a new round-trip in the critical path.
- **[Style-card quality depends on example curation quality]** → out of scope for this change (curation is 6A's/ongoing human responsibility); the script is re-runnable so a card can be regenerated after the corpus improves.

## Migration Plan

- Purely additive: new optional request field, new optional prompt branch, corrected (not removed) cache key shape. No schema change, no backfill. Teams that never set `default_style_pack_id` and never pass `style_pack_id` see byte-identical prompt output to before this change (verified by task 6.1's "no-pack call sites byte-identical" test).
- Rollback is a plain revert; the cache key format reverting simply means keys from the interim period age out within 24h, same as the forward migration.

## Open Questions

None — scope, prompt structure, and cache-key shape are fully pinned by the plan's design decisions and grounded against the current code in this session.
