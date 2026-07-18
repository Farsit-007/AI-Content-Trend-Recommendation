## Context

`POST /content/generate` today (post-6B) makes exactly one `chatCompletion` call whose system prompt is built by `buildSystemPrompt(fewShotExamples, voiceOptions, styleContext?)` and whose `RESPONSE_SHAPE_INSTRUCTION` demands a single JSON object with all five keys (`facebook_post`, `facebook_reel_script`, `linkedin_post`, `youtube_idea`, `caption`). `parseGeneratedContent` (`contentGeneration.parse.ts`) requires every field non-empty or returns `null` → 502. `GeneratedContent`'s Mongo `formats` subdoc has all five fields `required: true`. The Redis cache key (post-6B) is `content:${team}:${item}:${language}:${packId}` — one blob per team+item+language+pack, no format dimension. `generatedContent.job.ts` writes all five fields from one `generateContent()` call's result.

This design has two costs: (1) no format gets real length control — a 2,000-character Bangla LinkedIn post competing for token budget against four other formats inside one JSON string is exactly the current 502 failure mode (escaping/truncation); (2) wanting one more format later (e.g. a caption after the primary pair) forces a full five-format regeneration, wasting calls and cache.

## Goals / Non-Goals

**Goals:**
- Real per-format length/structure control via dedicated LLM calls.
- Eliminate JSON-wrapping as a failure mode for long text output.
- Per-format cache granularity so requesting one more format later is cheap.
- Preserve 6B's prompt composition (role → voice → style card/examples → team examples → grounding) — this change extends it, not replaces it.

**Non-Goals:**
- Streaming/SSE (frontend concern, later).
- Automatic humanize-critique second pass (explicitly deferred pending this change's bake-off outcome).
- YouTube-idea refinement or any change to its structured-object contract.
- Per-team generation quotas.
- Fact-grounding from full article content (change 7B).
- `regenerate`/`refine`/manual-draft-persistence (change 7C).

## Decisions

1. **Plain text for text formats is the load-bearing choice.** A per-format call returns the post body raw (no JSON wrapper); parsing is `stripFences(text).trim()`, non-empty. Only `youtube_idea` keeps `{title, hook, chapters[], thumbnail_concept}` as strict JSON with the existing shape validator (`isValidYoutubeIdea`, kept). This directly removes the JSON-escaping/truncation failure mode for every text format — the actual current 502 cause.

2. **Format registry, single source of truth:** new `contentGeneration.formats.ts` exporting `FormatId = 'facebook_post' | 'linkedin_post' | 'facebook_reel_script' | 'youtube_idea' | 'caption'`, `CONTENT_FORMATS: Record<FormatId, { label: string; kind: 'text' | 'json'; instruction: string }>`, and `DEFAULT_FORMATS: FormatId[] = ['facebook_post', 'linkedin_post']`. Instruction strings are written English-language but language-neutral (the existing `voiceInstructions` block already governs output language, so format instructions only govern structure/length, not language).
   - `facebook_post`: 150-400 words, hook first line, short paragraphs.
   - `linkedin_post`: 1,200-2,500 characters, line-broken paragraphs, 3-5 hashtags.
   - `facebook_reel_script`: scene/voice-over structure, ~60-90 seconds spoken.
   - `caption`: at most 200 characters.
   - `youtube_idea`: the existing `{title, hook, chapters[], thumbnail_concept}` JSON shape contract, moved here from the old monolithic `RESPONSE_SHAPE_INSTRUCTION`.

3. **`buildMessages` becomes per-format.** New signature `buildMessages(format: FormatId, topic, fewShotExamples, voiceOptions, newsContext?, styleContext?)`. The system prompt composes: `buildSystemPrompt`'s existing role/voice/style-card/style-examples/team-examples/grounding blocks (6B's structure, unchanged) + `ANTI_AI_TELL_INSTRUCTION` (text-kind formats only) + `CONTENT_FORMATS[format].instruction`. The all-format `RESPONSE_SHAPE_INSTRUCTION` const is deleted; `youtube_idea`'s JSON shape contract lives in its registry entry instead. `buildSystemPrompt`'s own signature and 6B's block-order behavior are otherwise untouched — this change only appends one more instruction segment before the (now per-format) response-shape line.

4. **Anti-AI-tell block (shared const, applied to text-kind formats only):** vary sentence lengths; open with a concrete hook, never a generic scene-setter; no formulaic closers ("সবশেষে বলা যায়…", "In conclusion"); prefer concrete details over abstractions; write with the rhythm of the provided examples; don't overuse em-dashes or bullet lists in prose formats. `youtube_idea` (a structured object, not prose) does not receive this block.

5. **Request/response contract — a deliberate breaking change:** `formats` validated as a non-empty, unique, ≤5-item subset of the five `FormatId`s (default `["facebook_post","linkedin_post"]` when omitted). Response is `{ topic, [each requested format]: ... }` — no `youtube_idea`/`caption`/`facebook_reel_script` unless explicitly requested. There are zero current consumers of the old five-key shape (no frontend integration yet), so this ships without a compatibility shim; existing integration tests are rewritten in this same change.

6. **Per-format cache entries, extending 6B's key exactly one segment further:** `content:${team}:${item}:${language}:${packId}:${format}`. Service flow: for each requested format, read its cache key; call the LLM only for cache misses (concurrently, `Promise.all`); on success, write each miss's result to its own key. Requesting `caption` after `facebook_post`+`linkedin_post` were already generated costs exactly one call and touches exactly one cache entry. `topic` itself is never cached (trivial to recompute, and it's just an echo of the request).

7. **Failure semantics: all-or-nothing per request.** If any *requested* format's call fails (LLM error, or the parsed result is empty/invalid), the whole request fails with 502 and no cache writes occur for that request's misses — already-cached formats from *prior* requests are untouched (they were never re-read or re-written by this failed request). Rationale: a partially-filled content editor teaches users to distrust the generate button. A partial-success-plus-`errors`-map response is explicitly deferred to the UI era (noted here, not built) if 502s prove frequent in practice.

8. **`GeneratedContent` (Mongo model + API interface) relaxation:** every field in the `formats` subdoc becomes `required: false` (the subdoc itself stays `required: true` on the parent document). A service-level invariant — "the formats object must contain at least one populated key" — is enforced at every write path (the auto job's `create` call in this change; change 7C's manual-draft `create` endpoint will need the same guard, out of scope here). The unique `{team_id, news_item_id}` sparse index is untouched (change 7C owns any index changes).

9. **Auto-generation job:** no change to *how* it calls `generateContent` (it already just calls it with `{team_id, topic, news_item_id}`, taking whatever `generateContent` returns by default) — but since the default response shape is now `{topic, facebook_post, linkedin_post}` instead of all five keys, the job's `GeneratedContent.create(...)` payload construction (which today explicitly lists all five fields) must be updated to only spread the two fields that now exist. `CANNED`-style test fixtures and format-count expectations are updated alongside.

10. **Failover visibility, not failover logic:** at `llmClient.ts` module load time, `logger.warn` once if `LLM_MODELS.fallback === LLM_MODELS.content`, naming the consequence ("a primary-model failure will not retry — failover is effectively disabled"). No behavior change to `chatCompletion`'s existing retry logic. `.env.example` gets a one-line comment reinforcing that the fallback should be a genuinely different model.

11. **Test infrastructure:** `support/openrouterMock.ts` gains `mockChatCompletionSequence(responses: string[])` (chained `mockResolvedValueOnce` calls, one per expected concurrent/sequential call) and `getChatCompletionRequests()` (every call's request body, for asserting each format's system prompt independently — `getLastChatCompletionRequest` alone can't distinguish two concurrent calls' prompts from each other reliably).

12. **The Bangla model bake-off is this change's manual verification gate, not a coded task.** Per the parent plan's still-open debt (`RAG-BANGLA-PLAN.md` §1.4): same 3 topics run against the current free-tier baseline and ≥2 stronger `LLM_MODEL_CONTENT` candidates (via `.env` swap + restart), scored by a native Bangla speaker for correctness/register/AI-tell. The chosen model is recorded in this change's own notes (and set in `.env`) before archiving. Code ships model-agnostic regardless of outcome — nothing in this change hardcodes a specific model id.

## Risks / Trade-offs

- **[All-or-nothing failure on multi-format requests]** → intentional per Decision 7; revisit only if 502 rate in practice proves the UX cost too high, at which point a partial-result-plus-`errors` response is the documented next step (not built now).
- **[Breaking response-shape change]** → zero current consumers; explicitly not treated as a compatibility concern in this change.
- **[Per-format calls mean up to 5 concurrent LLM calls per request instead of 1]** → bounded by `formats`' max-5 validation; default request is still 2 calls (same order of magnitude as before); `Promise.all` keeps wall-clock latency close to the slowest single call, not the sum.
- **[Bake-off outcome is unknown at proposal time]** → code is model-agnostic; whichever model wins, no further code change is needed — only an `.env` value.

## Migration Plan

- No data migration: existing `GeneratedContent` documents (all five fields populated, from before this change) remain valid under the relaxed schema (optional fields still accept populated values). No backfill.
- Cache: old-format keys (`content:${team}:${item}:${language}:${packId}`, no format segment) simply stop being read or written after this change ships; they age out within the existing 24h TTL. No explicit invalidation needed.
- Rollback is a plain revert; the relaxed Mongo schema reverting to `required: true` would only break newly-created partial documents from the window this change was live — acceptable for a hackathon-stage rollback if ever needed.

## Open Questions

- Which `LLM_MODEL_CONTENT` value wins the bake-off — resolved by this change's manual verification gate, recorded before archiving, not blocking implementation (code ships model-agnostic either way).
