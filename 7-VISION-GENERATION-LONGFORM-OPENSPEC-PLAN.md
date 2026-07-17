# 7 — Long-Form, Grounded, Regenerable Generation: OpenSpec Execution Plan

**Problem (V6/V9/V10 in the vision):** Facebook/LinkedIn need "big content" that "should not feel like ai generated," produced from a selected resource, with a click-tweak-copy loop. Today one LLM call must emit **all five formats in a single strict-JSON blob** (capping per-format length and mixing concerns), the 24h cache makes "regenerate" return the identical bytes, nothing supports instruction-based refinement, manual generations are never persisted (only the auto job writes `GeneratedContent`), and long-form grounding has only a 1-line snippet to stand on.
**Parent analysis:** [VISION-ALIGNMENT-DEEP-ANALYSIS.md](./VISION-ALIGNMENT-DEEP-ANALYSIS.md) §4 V6/V9/V10 (gaps), §6 Phase E (design), §8.1 (model-budget decision).
**Sibling plans:** requires [6-VISION-BANGLA-STYLE-PACKS-OPENSPEC-PLAN.md](./6-VISION-BANGLA-STYLE-PACKS-OPENSPEC-PLAN.md) **6B landed first** (7A extends 6B's prompt structure and cache key — running 7A first forces rework). Change 7B additionally requires [4-VISION-FULL-CONTENT-OPENSPEC-PLAN.md](./4-VISION-FULL-CONTENT-OPENSPEC-PLAN.md) 4A+4B (it consumes `content`). [8-VISION-FRONTEND-EXPERIENCE-OPENSPEC-PLAN.md](./8-VISION-FRONTEND-EXPERIENCE-OPENSPEC-PLAN.md) 8B consumes every endpoint shipped here.
**Global sequence position:** **7A → 7B → 7C** (7C may run before 7B if 4B is delayed — 7C has no content dependency). Full map in file 4 §Global sequence.
**Date:** 2026-07-17

> **Execution protocol:** `/opsx:propose` → `/opsx:apply` → Verification → `/opsx:archive`, one change at a time.

---

## 0. Verified baseline (re-checked 2026-07-17)

| Fact | Location |
|---|---|
| Single-call design: `RESPONSE_SHAPE_INSTRUCTION` demands one JSON object with exactly the 5 format keys; `buildMessages` → one `chatCompletion` (temp 0.7) → `parseGeneratedContent` strict all-5 validation, null → 502 | `contentGeneration.prompt.ts:5-9`, `contentGeneration.service.ts:79-91`, `contentGeneration.parse.ts:20-49` |
| `GeneratedContent` (API type): `topic` + all five formats **required** | `contentGeneration.interface.ts:10-17` |
| Redis cache: 24h TTL (`CONTENT_CACHE_TTL_SECONDS` default 86400); after 6B the key is `content:${team}:${item}:${language}:${packId}` — **no format dimension, no bypass flag**; cached hit returns identical bytes | `contentGeneration.service.ts:17-22, 55-59, 94` (pre-6B lines; 6B moves the key) |
| No length/structure directives exist for any format anywhere in the prompts | `contentGeneration.prompt.ts` (whole file) |
| `GeneratedContent` mongo model: `formats` subdoc with **all five fields `required: true`**; unique sparse index `{ team_id: 1, news_item_id: 1 }` (blocks a manual draft for any pair the auto job already drafted); routes: `GET /`, `POST /run`, `PATCH /:id` — **no create endpoint**; only `generatedContent.job.ts` ever writes documents | `generatedContent.model.ts:14-23, 37`, `generatedContent.route.ts`, `generatedContent.job.ts:64-78` |
| Auto job builds drafts from `generateContent(...)` result's five fields directly — changing the default format set changes what the job stores | `generatedContent.job.ts:59-78` |
| **Fallback failover is currently dead:** `.env` sets `LLM_MODEL_FALLBACK` identical to primary; `chatCompletion` throws the primary error when `fallbackModel === model` | `backend/.env` (all three model vars = `nvidia/nemotron-3-ultra-550b-a55b:free`), `lib/llmClient.ts:52-54` |
| The Bangla model fluency check (`RAG-BANGLA-PLAN.md` §1.4, flagged "critical") has no recorded outcome; free-tier-only was a hackathon-demo decision | `RAG-BANGLA-PLAN.md:1.4` |
| Test mock only supports a single canned completion (`mockResolvedValue`) — multi-call flows need a sequence helper | `__tests__/support/openrouterMock.ts:12-16` |
| Existing integration tests assert the all-5 response shape (`res.body.data.youtube_idea.title`, canned JSON blob) — they **will** need updating when the default becomes FB+LinkedIn | `__tests__/contentGeneration.integration.test.ts:18-48` |
| After change 4A/4B: `NewsItem.content` + `content_status` exist; `resolveNewsItemContext` currently returns `category/impact_note/snippet/url` only | `contentGeneration.service.ts:31-52` (as of `content-generation-news-grounding`) |
| Redis client + `setex` conventions | `lib/redis.ts`, `contentGeneration.service.ts:94` |
| Categorize-style strict-JSON offline call pattern (temp 0.3, fence-strip, soft fallback) — the template for the fact-sheet extractor | `newsIngestion.categorize.ts:30-95` |
| `assertTeamAccess` duplicated per service — copy the `GeneratedContent` one for new endpoints | `generatedContent.service.ts:8-13` |
| Test DB builds indexes from current schema definitions per run (fresh mongodb-memory/Atlas test db, `clearTestDb` deletes docs not indexes) — index-definition changes are exercised by integration tests automatically; **live Atlas keeps the old index until synced** | `__tests__/support/db.ts` |

**Non-goals:** streaming/SSE (frontend nicety, later); automatic humanize-critique second pass (explicitly deferred pending 7A's bake-off outcome — parent analysis §6 E5); YouTube-idea refinement (structured object, not a text rewrite — v1 refines text formats only); per-team generation quotas (ops concern, separate).

---

## Change 7A — `generation-longform-formats`

### Proposal input (for `/opsx:propose`)
> Rebuild generation output around per-format calls with real length/structure control. `POST /content/generate` gains `formats?: string[]` (allowed: `facebook_post`, `linkedin_post`, `facebook_reel_script`, `youtube_idea`, `caption`; default `["facebook_post","linkedin_post"]` — the vision's primary targets). Each requested format is its own LLM call with a format-specific system suffix: Facebook 150-400 words (hook first line, short paragraphs, emoji/hashtag policy deferred to style), LinkedIn 1,200-2,500 characters (line-broken, 3-5 hashtags), reel script scene/VO structure, caption ≤200 chars, YouTube idea keeps strict JSON. **Text formats return plain text, not JSON** — eliminating JSON-truncation/escaping failures for long Bangla output; only `youtube_idea` keeps the JSON contract, so parsing becomes per-format validators. Cache becomes per-format (`…:${format}`), so later on-demand formats reuse nothing they shouldn't and each format regenerates independently. `GeneratedContent` (API type + mongo `formats` subdoc) becomes partial (≥1 format), and the auto job stores the new default pair. Shared anti-AI-tell instructions join the system prompt for text formats. Also: warn at boot when the fallback model equals the primary (today's config silently disables failover), and run the deferred Bangla model bake-off as this change's verification gate.

### Design decisions
1. **Plain text for text formats is the load-bearing choice.** JSON-wrapping a 2,000-char Bangla post invites escaping errors and mid-string truncation on free-tier models — the current 502 failure mode. A per-format call returns the post body raw; parsing is `stripFences(text).trim()` non-empty. `youtube_idea` alone keeps `RESPONSE_SHAPE`-style strict JSON (`{title, hook, chapters[], thumbnail_concept}`) with the existing validator.
2. **Format registry, one source of truth:** `contentGeneration.formats.ts` exporting `CONTENT_FORMATS: Record<FormatId, { label; kind: 'text'|'json'; instruction: string }>` — the five per-format instruction strings live here verbatim (FB/LI include the numeric length targets; instructions written English-language but language-neutral, since the language block already governs output language). `buildMessages(format, …)` composes: 6B's system prompt (role, voice, style card/examples, team examples, grounding) + `ANTI_AI_TELL_INSTRUCTION` (text kinds only) + the format instruction + (json kind only) its JSON shape contract.
3. **Anti-AI-tell block (shared const, text formats):** vary sentence lengths; open with a concrete hook, never a generic scene-setter; no formulaic closers ("সবশেষে বলা যায়…", "In conclusion"); prefer concrete details over abstractions; write with the rhythm of the provided examples; don't overuse em-dashes or bullet lists in prose formats.
4. **Request/response contract:** `formats` validated as a non-empty unique subset; response is `{ topic, [each requested format] }`. This changes the **default** response shape (no `youtube_idea`/`caption`/reel unless requested) — a deliberate breaking change with zero current consumers; existing integration tests are updated in-change, docs regenerated.
5. **Per-format cache entries:** key `content:${team}:${item}:${language}:${packId}:${format}` (extends 6B's key). Read: assemble hits, call LLM only for misses; write per format. Result: requesting `caption` later costs one call; nothing invalidates unrelated formats. `topic` is not cached (trivially recomputed).
6. **Calls run concurrently** (`Promise.all` over ≤5 formats; default 2). Failure semantics: **all-or-nothing** — any format failing (LLM error or empty parse) → 502 and no cache writes for this request's misses (already-cached formats from prior requests are untouched). Rationale: a partially-filled editor teaches users to distrust the button; the alternative (partial + `errors` map) is noted for the UI era if 502s prove frequent.
7. **Mongo model relaxation:** `formats` fields all `required: false` (subdoc still required); service-level invariant "≥1 format present" on every write path. `youtube_idea` sub-schema unchanged internally. The unique `{team_id, news_item_id}` index is **not** touched here (7C owns it).
8. **Auto job:** calls `generateContent` with the default set (no code change to the call), stores `formats: { facebook_post, linkedin_post }`. `CANNED`-based tests and any format expectations updated.
9. **Failover + model quality:** boot-time `logger.warn` (in `llmClient.ts` module init) when `LLM_MODELS.fallback === LLM_MODELS.content` naming the consequence ("failover disabled"). `.env.example` documents choosing a *different* fallback. The **Bangla bake-off** (RAG-BANGLA §1.4, still unpaid debt) becomes this change's manual verification gate: 3 topics × candidate `LLM_MODEL_CONTENT` values (current free Nemotron baseline vs. ≥2 stronger candidates via OpenRouter env swap), native-speaker scoring of Bangla correctness / register / AI-tell; record the chosen model in the change's notes. Code ships model-agnostic either way.
10. **Test infra:** `openrouterMock` gains `mockChatCompletionSequence(responses: string[])` (chained `mockResolvedValueOnce`) and `getChatCompletionRequests()` (all calls, for per-format prompt assertions).

### Spec delta (capability `content-generation`)

## MODIFIED Requirements

### Requirement: Per-Format Long-Form Generation
`POST /content/generate` SHALL accept `formats` (unique non-empty subset of `facebook_post`, `linkedin_post`, `facebook_reel_script`, `youtube_idea`, `caption`; default `["facebook_post","linkedin_post"]`) and SHALL produce each requested format via its own LLM call carrying format-specific structure and length directives — Facebook post 150-400 words opening with a hook line; LinkedIn post 1,200-2,500 characters with paragraph breaks and 3-5 hashtags; caption at most 200 characters; reel script in scene/voice-over structure; YouTube idea as the existing structured object. Text formats SHALL be requested and parsed as plain text; only `youtube_idea` SHALL use a JSON contract. The response SHALL contain exactly the requested formats plus `topic`. If any requested format fails, the request SHALL fail as a whole. Text-format system prompts SHALL include fixed anti-AI-tell style instructions.

#### Scenario: Default request yields the two primary formats
- **WHEN** `POST /content/generate` is called without `formats`
- **THEN** exactly two LLM calls occur and the response contains `facebook_post` and `linkedin_post` only (plus `topic`)

#### Scenario: Length directives reach the model
- **WHEN** a `linkedin_post` is generated
- **THEN** that call's system prompt contains the 1,200-2,500-character directive, and the `facebook_post` call's prompt contains the 150-400-word directive

#### Scenario: Long Bangla output survives parsing
- **WHEN** a text-format call returns a long plain-text Bangla post (no JSON)
- **THEN** it is accepted verbatim (fence/whitespace-trimmed), with no JSON parse step to fail

#### Scenario: Invalid format rejected
- **WHEN** `formats` contains an unknown value or is empty
- **THEN** the request fails validation with HTTP 400

### Requirement: Per-Format Caching and Draft Shape
Generated output SHALL be cached per team+item+language+style-pack+**format**, so an individual format can be served from cache, generated on demand, or regenerated without touching sibling formats. Stored drafts (`GeneratedContent.formats`) SHALL accept any non-empty subset of formats; the auto-generation job SHALL store the default pair.

#### Scenario: On-demand format reuses nothing stale
- **WHEN** `facebook_post`+`linkedin_post` were generated earlier and a request now asks for `caption` only
- **THEN** exactly one LLM call occurs (the caption) and the response contains only `caption` + `topic`

#### Scenario: Auto job stores partial formats
- **WHEN** the auto-generation job drafts a news item
- **THEN** the stored draft's `formats` contains `facebook_post` and `linkedin_post` and passes validation

### Tasks
1. **Format registry & prompts**
   - [ ] 1.1 New `contentGeneration.formats.ts`: `FormatId` union, `CONTENT_FORMATS` registry with the five instruction strings (FB 150-400 words/hook-first; LI 1200-2500 chars/line breaks/3-5 hashtags; caption ≤200 chars; reel scene/VO ~60-90s; youtube_idea JSON shape), `DEFAULT_FORMATS = ['facebook_post','linkedin_post']`
   - [ ] 1.2 `contentGeneration.prompt.ts`: `ANTI_AI_TELL_INSTRUCTION` const (§Design-3 text); `buildMessages(format, topic, fewShot, voice, newsContext, styleContext)` composes per §Design-2; delete the all-5 `RESPONSE_SHAPE_INSTRUCTION` (youtube_idea's JSON contract moves into its registry entry)
   - [ ] 1.3 `contentGeneration.parse.ts`: `parseTextFormat(raw)` (strip fences/quotes, trim, non-empty) + keep `isValidYoutubeIdea`-based `parseYoutubeIdea(raw)`; delete `parseGeneratedContent`
2. **Service**
   - [ ] 2.1 `contentGeneration.interface.ts`: all `GeneratedContent` format fields optional; `GenerateContentRequest.formats?: FormatId[]`
   - [ ] 2.2 `contentGeneration.validation.ts`: `formats: z.array(z.enum([...])).nonempty().max(5).refine(unique)` optional
   - [ ] 2.3 `contentGeneration.service.ts`: per-format cache read → concurrent calls for misses → per-format parse → all-or-nothing assembly → per-format cache writes; cache key gains `:${format}`
3. **Draft model & job**
   - [ ] 3.1 `generatedContent.model.ts`: formats fields `required: false`; `generatedContent.interface.ts` aligned; service-level ≥1-format guard on the job's create
   - [ ] 3.2 `generatedContent.job.ts`: store the two default formats; adjust types
4. **Failover & docs**
   - [ ] 4.1 `lib/llmClient.ts`: boot warn when fallback === content model; `.env.example` guidance comment
   - [ ] 4.2 `docs/` content-generation schemas/paths reflect `formats` + partial response
5. **Tests**
   - [ ] 5.1 `support/openrouterMock.ts`: add `mockChatCompletionSequence`, `getChatCompletionRequests`
   - [ ] 5.2 Update existing `contentGeneration.integration.test.ts` for the new default shape (two text responses via sequence mock; assertions on both prompts' directives)
   - [ ] 5.3 New cases: unknown format → 400; `formats:['youtube_idea']` → JSON parsed object; caption-after-primary cache case (call-count 1); one-format-fails → 502 (sequence: valid, then rejected call)
   - [ ] 5.4 Prompt unit tests: anti-AI-tell present for text formats, absent for youtube_idea; per-format instruction present
   - [ ] 5.5 Job test (from 5A's new file or inline): stored draft has exactly the pair
6. - [ ] 6.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live: generate for a real news item — FB post lands in 150-400 words, LinkedIn in 1,200-2,500 chars (count them), visibly longer/structured vs. pre-change output; request `caption` afterwards → fast (one call).
- **Bake-off gate (manual, records outcome):** same 3 topics across current model + ≥2 candidates (env swap + `docker restart`); native speaker scores Bangla correctness/register/AI-tell per format; chosen model written into the change notes and `.env`. Boot log shows the failover warning until `.env` sets a distinct fallback — then doesn't.

---

## Change 7B — `generation-facts-then-write`

### Proposal input (for `/opsx:propose`)
> Ground long-form output in the full stored content (from plan 4): a facts-then-write pipeline. `resolveNewsItemContext` additionally returns `content`/`content_status`. When resolved content is ≥ a configurable threshold (`CONTENT_FACTS_MIN_CHARS`, default 800), a cheap extraction call (standard model, temp 0.2, strict JSON `{ summary, facts[] }`, input capped at `CONTENT_FACTS_INPUT_MAX_CHARS` default 12000) produces a fact sheet that is cached in Redis per news item (`facts:<id>`, 7-day TTL — shared across every team and format generating from that item) and injected into each format's user prompt as a "Key facts from the source — ground your claims in these" block alongside the existing snippet/url lines; the grounding instruction is updated to reference the fact list. Extraction soft-fails: any LLM/parse failure logs and generation proceeds exactly as today (snippet-grounded). Short/absent content skips extraction entirely.

### Design decisions
1. **Why a separate extraction call instead of pasting content into the write prompt:** (a) 20k chars of source would dwarf the style examples and dilute style transfer; (b) facts extracted once serve *every* format and every team generating from that item (Redis-shared), so the marginal cost is one cheap call per news item per week; (c) a bounded fact list is exactly what the anti-hallucination instruction can anchor to.
2. **Fact-sheet contract:** `{ "summary": "<≤3 sentences>", "facts": ["<≤200 chars>", … 5-10 items] }` — extractor prompt mirrors `categorizeOneBatch`'s strict-JSON discipline (fence-strip, validate shape, null on any deviation). Facts are neutral English regardless of output language (they're reference data, not copy).
3. **Threshold rationale:** below ~800 chars the snippet already carries everything — an extra call buys nothing. Config: `CONTENT_FACTS_MIN_CHARS` (default `'800'`), `CONTENT_FACTS_INPUT_MAX_CHARS` (default `'12000'`) under `config.analytics`-style plumbing → `config.content_generation.{facts_min_chars, facts_input_max_chars}` (new config namespace, two keys).
4. **Cache placement:** `facts:${newsItemId}` with `setex` 604800 — keyed by item alone (facts are team/language/format-independent by construction). Regenerate/`refine` never bypass this cache (facts don't go stale within the item's lifetime; the retention plan removes the item long before 7 days matter).
5. **Prompt injection point:** `buildUserPrompt` gains an optional `factSheet` param rendering after the existing context line: `\n\nKey facts from the source (ground your claims in these; do not invent beyond them):\n- <fact>…\nSummary: <summary>`. `GROUNDING_INSTRUCTION` sentence extended to mention "the provided fact list". Rendering identical across formats.
6. **Failure = absence.** Extractor throw/null → `logger.warn` once per request, `factSheet` undefined, output identical to 7A behavior. No retries (the `chatCompletion` fallback already covers transport).

### Spec delta (capability `content-generation`)

## MODIFIED Requirements

### Requirement: Fact-Grounded Long-Form Generation
When a resolved news item carries stored content of at least the configured minimum length, generation SHALL first obtain a fact sheet (≤3-sentence summary + 5-10 short facts) extracted by a cheap model call from the capped content, cache it per news item for reuse across teams, formats, and requests, and include it in every format's user prompt as grounding reference; the system grounding instruction SHALL direct the model to ground claims in the provided facts. Fact extraction failure or short/absent content SHALL leave generation behavior identical to the snippet-grounded path.

#### Scenario: Content-rich item generates from facts
- **WHEN** generation runs for an item whose `content` exceeds the threshold
- **THEN** one extraction call precedes the format calls and each format's user prompt contains the fact list

#### Scenario: Fact sheet reused across teams
- **WHEN** a second team generates from the same news item within the facts TTL
- **THEN** no new extraction call occurs

#### Scenario: Thin content skips extraction
- **WHEN** the item has no content or content below the threshold
- **THEN** no extraction call occurs and prompts match the pre-change shape

#### Scenario: Extraction failure is soft
- **WHEN** the extraction call returns unparseable output
- **THEN** generation completes normally without a facts block, logging a warning

### Tasks
1. - [ ] 1.1 `config/index.ts`: `CONTENT_FACTS_MIN_CHARS` (`'800'`), `CONTENT_FACTS_INPUT_MAX_CHARS` (`'12000'`) → `config.content_generation.*`
2. - [ ] 2.1 `contentGeneration.interface.ts`: `NewsItemContext` gains `content?: string`, `content_status?: string`
   - [ ] 2.2 `contentGeneration.service.ts` `resolveNewsItemContext`: return the two fields
3. - [ ] 3.1 New `contentGeneration.facts.ts`: `extractFactSheet(title, content)` per §Design-2 (exported prompt const for tests); `getOrExtractFactSheet(newsItemId, title, content)` Redis wrapper per §Design-4
   - [ ] 3.2 `contentGeneration.service.ts`: threshold gate → fact sheet resolution before format calls; thread into prompt building
4. - [ ] 4.1 `contentGeneration.prompt.ts`: `buildUserPrompt(..., factSheet?)` rendering per §Design-5; grounding instruction wording update
5. **Tests**
   - [ ] 5.1 `contentGeneration.facts` unit: valid JSON parsed; fenced JSON parsed; wrong shape → null; input capped at max chars
   - [ ] 5.2 Integration: content-rich item → extraction call + facts in both default formats' user prompts (sequence mock: facts JSON, then two texts); second generate (different team) → no extraction call (facts cached; assert call count)
   - [ ] 5.3 Integration: short-content item → no extraction call, prompt shape unchanged; extraction returning garbage → 200 with warning path (facts absent)
   - [ ] 5.4 Prompt unit: facts block rendering exact format
6. - [ ] 6.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live (requires 4A/4B ingested data): pick an item with `content_status: 'full'` (e.g. a dev.to article) → generate → read output vs. the article: **claims traceable to the fact sheet, no invented numbers**; check Redis `facts:<id>` exists; second team's generate reuses it (no extraction in logs). Pick a `failed`-content item → output remains appropriately general (7A behavior).

---

## Change 7C — `generation-refine-and-drafts`

### Proposal input (for `/opsx:propose`)
> Complete the click-tweak-copy loop's backend: (1) `POST /content/generate` gains `regenerate: true` — skips per-format cache reads and overwrites entries on success, so "Regenerate" produces fresh output instead of the cached bytes; (2) new `POST /content/refine` — `{ team_id, format (text formats only), current_text, instruction, language?, style_pack_id? }` → one uncached LLM call that applies the instruction to the draft while preserving language/style, returning `{ revised_text }` (powers tweak chips like "shorter" / "more casual" / "stronger hook"); (3) manual drafts become persistable: `POST /generated-content` creates a `source: 'manual'`, `status: 'draft'` document (team-access-gated, ≥1 format), and the unique `{team_id, news_item_id}` index becomes a **partial unique index scoped to `source: 'auto'`** so manual saves never collide with the auto job's dedupe guarantee (the auto job's any-source `alreadyDrafted` check keeps it from re-drafting items a team saved manually). Ships a one-shot index-sync script for the live Atlas DB.

### Design decisions
1. **Regenerate = cache bypass + overwrite, no variant bookkeeping.** Last result wins the cache slot; the UI holds anything the user wants to keep (and can Save it as a draft). Simplest correct semantics.
2. **Refine is stateless and uncached:** input is the current editor text (1..6000 chars) + instruction (1..300); system prompt = language instruction (resolved as in generate) + optional style card (pack resolved as in 6B; examples omitted — the draft itself carries the style) + anti-AI-tell + fixed editing contract: "Edit the draft per the instruction. Preserve its language, register, and factual claims. Change no more than the instruction requires. Return ONLY the revised text."; user prompt = draft + instruction. Temp 0.5. Text formats only (`youtube_idea` is structured — excluded v1, validation-enforced).
3. **Explicit save endpoint, not auto-persist.** Auto-persisting every generate/regenerate would spam drafts during iteration; the UI's Save button posts the final state once. Body: `{ team_id, news_item_id?, topic (1..300), formats (partial, ≥1, per-field type checks incl. youtube_idea object), model_used? }`; server sets `source:'manual'`, `status:'draft'`. Reuses `assertTeamAccess`; listed by the existing `GET /generated-content`; status transitions via existing `PATCH /:id`.
4. **Index migration mechanics:** schema declaration becomes `index({ team_id: 1, news_item_id: 1 }, { unique: true, partialFilterExpression: { source: 'auto', news_item_id: { $exists: true } } })`. Fresh DBs (tests) build it automatically; **live Atlas retains the old sparse-unique index** — ship `scripts/syncGeneratedContentIndexes.ts` (npm `db:sync-generated-content-indexes`) calling `GeneratedContent.syncIndexes()` scoped to this model, run once at deploy (verification step). Auto-job dedupe semantics preserved by the partial filter; duplicate *manual* saves for the same pair are allowed by design (a team may save two variants).
5. **Route order:** add `POST /` in `generatedContent.route.ts` (no conflict with `POST /run`); refine route lives in `ContentGeneration` (`router.post('/refine', …)` beside `/generate`).

### Spec delta (capability `content-generation`)

## MODIFIED Requirements

### Requirement: Regeneration Bypasses Cache
`POST /content/generate` SHALL accept `regenerate: boolean`; when true, per-format cache reads are skipped for the requested formats and successful fresh output overwrites the cached entries.

#### Scenario: Regenerate produces fresh output
- **WHEN** a format is cached and a request repeats it with `regenerate: true`
- **THEN** a new LLM call occurs and the cache slot afterwards holds the new output

## ADDED Requirements

### Requirement: Instruction-Based Draft Refinement
`POST /content/refine` SHALL apply a short instruction to a provided text-format draft via a single uncached LLM call that preserves the draft's language and register and changes no more than instructed, returning the revised text. It SHALL enforce team access, accept only text formats, and resolve language and style pack exactly as generation does.

#### Scenario: Tweak chip refines a draft
- **WHEN** a member posts a Bangla `facebook_post` draft with instruction "make it shorter"
- **THEN** the response is a shorter Bangla revision of that draft, and no cache entries change

#### Scenario: Structured format rejected
- **WHEN** `format: "youtube_idea"` is sent to refine
- **THEN** the request fails validation with HTTP 400

### Requirement: Manual Draft Persistence
`POST /generated-content` SHALL create a team-scoped manual draft (`source: 'manual'`, `status: 'draft'`) holding at least one format. Uniqueness of team+news-item pairs SHALL constrain only auto-generated drafts, so manual saves never conflict with the auto job's per-pair dedupe — which SHALL continue to skip items already drafted by either source.

#### Scenario: Manual save coexists with auto draft
- **WHEN** the auto job already drafted item X for team T and a member saves a manual draft for the same pair
- **THEN** the manual save succeeds and both documents appear in the team's draft list

#### Scenario: Auto dedupe still holds
- **WHEN** the auto job encounters a pair it already auto-drafted
- **THEN** the unique constraint/dedupe still prevents a second auto draft

### Tasks
1. **Regenerate**
   - [ ] 1.1 `contentGeneration.validation.ts`: `regenerate: z.boolean().optional()`; interface field; service skips reads/overwrites writes when set
2. **Refine**
   - [ ] 2.1 `contentGeneration.validation.ts`: `refineContentValidation` per §Design-3 bounds (format enum excludes `youtube_idea`)
   - [ ] 2.2 `contentGeneration.prompt.ts`: `buildRefineMessages(...)` (editing contract verbatim from §Design-2)
   - [ ] 2.3 `contentGeneration.service.ts`: `refineContent(payload, user)` — team access, voice+pack resolution, one call, `parseTextFormat`, return `{ revised_text }`; controller + route `POST /content/refine`
3. **Manual drafts & index**
   - [ ] 3.1 `generatedContent.validation.ts`: `createDraftValidation` per §Design-3
   - [ ] 3.2 `generatedContent.service.ts` `createDraft` + controller + `POST /` route (requireAuth; team access in service)
   - [ ] 3.3 `generatedContent.model.ts`: partial unique index per §Design-4
   - [ ] 3.4 `scripts/syncGeneratedContentIndexes.ts` + npm script
4. **Docs**
   - [ ] 4.1 refine + create-draft + regenerate in `docs/` schemas/paths
5. **Tests**
   - [ ] 5.1 Regenerate: cached format + `regenerate: true` → new call (count), cache overwritten (subsequent plain request returns the new text without a call)
   - [ ] 5.2 Refine integration: happy path (mock revision); youtube_idea → 400; foreign team → 403; oversized text → 400
   - [ ] 5.3 Drafts: manual save for an auto-drafted pair succeeds and lists both; direct second `source:'auto'` insert for the same pair rejects (duplicate key); topic-only manual draft (no news_item_id) saves; missing formats → 400
6. - [ ] 6.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live: run `npm run db:sync-generated-content-indexes` against Atlas once; confirm via logs/output the old index replaced. Generate → regenerate (different output) → refine with "আরো ছোট করো" (shorter Bangla revision) → save draft → `GET /generated-content?team_id=…` shows it as `manual/draft` beside auto drafts → `PATCH` to `approved`.
- **Definition of done for the whole plan:** from one news item, a team produces a 300-word Bangla FB post + long LinkedIn post grounded in the article's real facts, regenerates one of them, shortens it via refine, and saves the result — all through the API, all tests green.
