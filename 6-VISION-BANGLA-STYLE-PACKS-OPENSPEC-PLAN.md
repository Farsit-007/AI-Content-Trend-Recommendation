# 6 — Bangla Writer Style Packs (Global Style RAG): OpenSpec Execution Plan

**Problem (V7/V9 in the vision):** "Using RAG we will train our ai about different bangla blogs, articles, contents of different tones of popular bangla tech writers so that our system can produce contents like that same styles, tone, accent in bangla… mostly Programming Hero ed tech company style… should not feel like ai generated." What's shipped today is **per-team brand voice** (a team's own posts, 3 few-shots per generation). The vision needs a **shared, curated, multi-tone corpus of named writer styles**, selectable per team and per request — a different data model, retrieval path, and prompt structure.
**Parent analysis:** [VISION-ALIGNMENT-DEEP-ANALYSIS.md](./VISION-ALIGNMENT-DEEP-ANALYSIS.md) §4 V7/V9 (gap), §6 Phase D (design), §8.2-8.3 (embedding + copyright risks).
**Sibling plans:** [RAG-BANGLA-PLAN.md](./RAG-BANGLA-PLAN.md) built the per-team layer this composes with (do not modify its behavior for teams without packs). [7-VISION-GENERATION-LONGFORM-OPENSPEC-PLAN.md](./7-VISION-GENERATION-LONGFORM-OPENSPEC-PLAN.md) builds on 6B's prompt structure — run 6B before 7A to avoid rework.
**Global sequence position:** changes **6A → 6B**; independent start; 6B before 7A recommended. Full map in file 4 §Global sequence.
**Date:** 2026-07-17

> **Execution protocol:** `/opsx:propose` → `/opsx:apply` → Verification → `/opsx:archive`, one change at a time.

---

## 0. Verified baseline (re-checked 2026-07-17)

| Fact | Location |
|---|---|
| Module conventions to copy exactly: `BrandVoiceExample/` has interface / model / validation / controller / service / route / utils; routes registered centrally | `modules/BrandVoiceExample/*`, `routes/index.ts:26-41` |
| Embedding validator pattern (1536-dim) and `embed()` on create | `brandVoiceExample.model.ts:9-16`, `brandVoiceExample.service.ts:20-21`, `lib/embeddings.ts` |
| `requireSuperAdmin` middleware **exists** (platform-catalog precedent); `requireAdmin` passes super_admin too | `middleware/auth.ts:79-92` |
| Retrieval pattern to copy: fetch all candidates `{content, embedding}` → pure in-memory cosine ranking → top-N `FewShotExample[]` | `contentGeneration.retrieval.ts:29-46, 81-90` |
| `FewShotExample.source` union is `'brand_voice_example' \| 'platform_post'` — extending it touches `formatExamples`'s label rendering only | `contentGeneration.interface.ts:27-31`, `contentGeneration.prompt.ts:16-22` |
| `buildSystemPrompt(fewShotExamples, voiceOptions)` — two branches: cold-start (no examples → brand-neutral) and warm; today's blocks: role intro → voice instructions → [examples] → GROUNDING_INSTRUCTION → RESPONSE_SHAPE_INSTRUCTION | `contentGeneration.prompt.ts:24-55` |
| Cold-start signal is `hasBrandVoiceExamples(team_id)` count>0; when cold, retrieval is skipped entirely | `contentGeneration.retrieval.ts:23-26`, `contentGeneration.service.ts:67-75` |
| **Pre-existing cache bug this plan fixes:** `buildCacheKey(teamId, newsItemId, topic)` ignores language — a cached Bangla result is served to a later `language: 'english'` request for the same team+item (24h TTL) | `contentGeneration.service.ts:19-22, 55-59` |
| `GenerateContentRequest`: `{ team_id, topic, news_item_id?, language? }`; validation file small and additive | `contentGeneration.interface.ts:19-25`, `contentGeneration.validation.ts:5-12` |
| `resolveVoiceOptions` resolution order: request override → team default → `'bangla'` — the pattern to mirror for pack resolution | `lib/voiceProfile.ts:28-38` |
| Team model/service/validation extension mechanics (Pick-widening + zod) verified in file 5 baseline | `team.service.ts:54-63`, `team.validation.ts:13-24` |
| Seed-script conventions: args parsing, zod file schema, idempotent by exact `content`, npm script registration | `scripts/seedBrandVoice.ts`, `backend/package.json` scripts |
| LLM call convention for offline analysis: `chatCompletion({ model: LLM_MODELS.standard, temperature: 0.3, messages })` + fence-strip parse | `newsIngestion.categorize.ts:40-95`, `lib/llmClient.ts` |
| Test mocks: `mockChatCompletion` / `mockEmbedding` / `getLastChatCompletionRequest` | `__tests__/support/openrouterMock.ts` |
| Soft-fail precedent for optional context (missing id → log warn, continue) | `contentGeneration.service.ts:31-47` |
| API docs live in `docs/schemas.ts` + per-domain path files aggregated in `docs/openapi.ts` | `backend/src/app/docs/*` |

**Non-goals:** fine-tuning any model (personalization stays data-side, per `RAG-BANGLA-PLAN.md`'s core principle); per-format platform-aware retrieval (arrives naturally with 7A — 6B keeps retrieval format-agnostic); scraping tooling for collecting writer posts (curation is manual/human; the seed script is the intake); public attribution of writers (packs are internal style references — parent analysis §8.3).

---

## Change 6A — `style-packs-foundation`

### Proposal input (for `/opsx:propose`)
> Add a global, super_admin-curated "style pack" corpus: named Bangladeshi writing styles (e.g. `programming-hero` energetic edtech tone) each holding 30-100 example posts with embeddings, retrievable by topic similarity — the shared style layer the per-team brand voice composes with. New `StylePack` module (model + full CRUD API): packs (`name`, unique `slug`, `description`, `language`, `tone_tags`, optional `style_card`, `is_active`) and examples (`content` + 1536-dim embedding auto-generated on create, `platform`, optional `source_ref`/`engagement_hint`). super_admin manages packs and examples; any authenticated user lists active packs (the Generate UI needs them). `Team` gains optional `default_style_pack_id`. Ship a `seed:style-pack` bulk-import script (idempotent, mirrors `seed:brand-voice`), a seed example file, and a `verify:style-pack-retrieval` script that ranks a pack's examples against a query topic for a human retrieval-quality eyeball (the Bangla-embedding sanity check the parent analysis §8.2 requires). Generation integration is deliberately excluded (next change).

### Design decisions
1. **Global scope, no `team_id` on packs/examples.** The whole point is shared curation; team-ness enters only via `Team.default_style_pack_id` and (in 6B) a per-request override. RBAC: mutations `requireSuperAdmin` (platform-catalog precedent — this is system-wide curated vocabulary); reads `requireAuth` (any signed-in user; the Generate UI must list packs). Inactive packs are visible only with `?include_inactive=true` by super_admin.
2. **Two collections, not embedded arrays:** `style_packs` and `style_examples` (`style_pack_id` indexed). Packs are small; examples are 30-100 × ~1-3 KB text + 1536-float embedding — embedding them in the pack document would blow past sensible document sizes and complicate example CRUD.
3. **Deletion semantics:** `PATCH` toggles `is_active` (the normal "retire" path). `DELETE /style-packs/:id` hard-deletes the pack **and** its examples (super_admin, irreversible, confirmed client-side). Teams pointing at a deleted/inactive pack must not break — 6B resolves packs soft-fail (missing/inactive → generate without a pack, log warn), same philosophy as `resolveNewsItemContext`.
4. **Example create embeds server-side** via the existing `embed()` (identical to brand-voice create) — imports never carry vectors. Idempotency in the seed script: skip when exact `content` already exists in the pack.
5. **`style_card` is a plain string field now, generated later** (6B ships the generator script). Curators may also hand-write one from day one — the field is just data.
6. **Platform enum on examples:** `'facebook' | 'linkedin' | 'other'` (default `'other'`). 6B ignores it; 7A's per-format generation will prefer platform-matched examples — capture the metadata now so the corpus doesn't need re-tagging.
7. **Retrieval-sanity script, not a unit test, for embedding quality:** `verifyStylePackRetrieval.ts` connects live, embeds a CLI-provided topic, prints the top-5 ranked examples. Whether `text-embedding-3-small` ranks Bangla content sensibly is a judgment call for a human — the script makes the check take 2 minutes. If ranking is poor, the documented fallback (parent analysis §6 D5) is storing an LLM-extracted English topic summary per example and embedding that — a follow-up change, not this one.
8. **Seed data:** `seed/style-pack.example.json` documents the shape `[{ content, platform?, source_ref?, engagement_hint? }]` with 2-3 real-shaped Bangla examples (the existing `seed/brand-voice.example.json` posts show the expected register). Curating the real packs (30-100 posts each) is human work tracked outside OpenSpec.

### Spec delta (capability `style-packs`)

## ADDED Requirements

### Requirement: Global Style Pack Corpus
The system SHALL provide style packs — globally shared, named writing styles with language, tone tags, an optional style card, and an active flag — each holding curated example posts stored with server-generated 1536-dimension embeddings. super_admins SHALL manage packs and examples via CRUD APIs; any authenticated user SHALL be able to list active packs and read a pack with its example count. Deleting a pack SHALL delete its examples. A bulk-import script SHALL idempotently seed a pack's examples from a JSON file.

#### Scenario: super_admin creates a pack and adds examples
- **WHEN** a super_admin creates pack `programming-hero` and posts an example with Bangla content
- **THEN** the example is stored with a 1536-dimension embedding generated from its content, and the pack's detail read reports the example count

#### Scenario: Non-super_admin cannot mutate
- **WHEN** an admin or regular user attempts to create/update/delete a pack or example
- **THEN** the request is rejected with HTTP 403

#### Scenario: Authenticated users list active packs
- **WHEN** any authenticated user lists style packs
- **THEN** active packs are returned with name, slug, description, language, and tone tags; inactive packs appear only for super_admin with `include_inactive`

#### Scenario: Idempotent seeding
- **WHEN** the seed script runs twice with the same file
- **THEN** the second run creates no duplicate examples and reports them skipped

### Requirement: Team Default Style Pack
A team SHALL optionally reference a default style pack (`default_style_pack_id`), editable through the existing team update endpoint, validated as an ObjectId. A dangling reference (deleted/inactive pack) SHALL NOT make any team operation fail.

#### Scenario: Team default set
- **WHEN** an admin PATCHes a team with a valid `default_style_pack_id`
- **THEN** the team stores it and returns it on reads

### Tasks
1. **Module scaffolding** — new `backend/src/app/modules/StylePack/` mirroring BrandVoiceExample structure:
   - [ ] 1.1 `stylePack.interface.ts`: `IStylePack { name; slug; description?; language: LanguageStyle; tone_tags: string[]; style_card?: string; is_active: boolean; created_by: string; created_at: Date }`; `IStyleExample { style_pack_id; content; embedding: number[]; platform: 'facebook'|'linkedin'|'other'; source_ref?: string; engagement_hint?: string; created_at: Date }`
   - [ ] 1.2 `stylePack.model.ts`: two schemas/models (`style_packs`, `style_examples`); unique index on `slug`; index `{ style_pack_id: 1 }` on examples; 1536-dim embedding validator copied from brand-voice
   - [ ] 1.3 `stylePack.validation.ts`: create/update pack (slug `^[a-z0-9-]+$`, language enum, tone_tags ≤10, style_card ≤4000); create example (content 1..8000, platform enum optional); list query (`include_inactive` boolean-string optional)
   - [ ] 1.4 `stylePack.service.ts`: createPack / listPacks(includeInactive, role) / getPackById (with `example_count` via `countDocuments`) / updatePack / deletePack (cascade `StyleExample.deleteMany`) / addExample (embeds) / listExamples (paginated) / deleteExample
   - [ ] 1.5 `stylePack.controller.ts` + `stylePack.route.ts`: `POST /` `PATCH /:id` `DELETE /:id` `POST /:id/examples` `DELETE /:id/examples/:exampleId` behind `requireAuth, requireSuperAdmin`; `GET /` `GET /:id` `GET /:id/examples` behind `requireAuth`; register `{ path: '/style-packs' }` in `routes/index.ts`
2. **Team linkage**
   - [ ] 2.1 `team.interface.ts` + `team.model.ts`: `default_style_pack_id?: string`
   - [ ] 2.2 `team.validation.ts` updateTeamValidation + `team.service.ts` updateTeam Pick: add the field (objectId, optional, nullable to allow clearing)
3. **Scripts & seed data**
   - [ ] 3.1 `scripts/seedStylePack.ts` (`npm run seed:style-pack -- <slug> <file.json>`): zod-validate file `[{ content, platform?, source_ref?, engagement_hint? }]`; create pack if missing (prompting fields via args `--name --language` or sensible defaults documented in usage); skip exact-content dupes; report created/skipped/total
   - [ ] 3.2 `seed/style-pack.example.json` with shape documentation and 2-3 Bangla-register examples
   - [ ] 3.3 `scripts/verifyStylePackRetrieval.ts` (`npm run verify:style-pack-retrieval -- <slug> "<topic>"`): embed topic live, cosine-rank the pack's examples, print top-5 with scores
   - [ ] 3.4 Register both npm scripts in `backend/package.json`
4. **Docs**
   - [ ] 4.1 `docs/schemas.ts` + a `stylePackPaths.ts` wired into `docs/openapi.ts` (follow `generatedContentPaths.ts` as the template)
5. **Tests** — new `__tests__/stylePack.integration.test.ts` (mock openrouter for embeds):
   - [ ] 5.1 super_admin CRUD happy path incl. example embedding dimension; admin/user → 403 on mutations; user can list/read active
   - [ ] 5.2 delete pack cascades examples
   - [ ] 5.3 `include_inactive` visibility rules
   - [ ] 5.4 team PATCH stores/clears `default_style_pack_id`
6. - [ ] 6.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live: create a pack via API as super_admin; `npm run seed:style-pack -- programming-hero seed/style-pack.example.json`; re-run → all skipped; `npm run verify:style-pack-retrieval -- programming-hero "AI দিয়ে ওয়েবসাইট"` → **human check: top-ranked examples are topically sensible** (record the verdict in the change notes — this is the §8.2 gate for 6B).
- Swagger UI shows the new endpoints.

---

## Change 6B — `style-packs-generation`

### Proposal input (for `/opsx:propose`)
> Wire style packs into content generation. `POST /content/generate` gains optional `style_pack_id`; resolution order: request override → team `default_style_pack_id` → none, soft-failing on missing/inactive packs. When a pack resolves, retrieval fetches its top-5 topic-similar examples and the system prompt gains a structured style section — pack style card ("how this style writes") + pack examples ("write exactly in the style of these") — ordered **before** the team's own brand-voice examples ("blend this team's specifics"), so the pack owns tone while team examples contribute terminology; the cold-start rule changes from "no brand voice examples → brand-neutral" to "no brand voice examples **and no pack** → brand-neutral". Ship the offline style-card generator script (`style:generate-card -- <slug>`): one LLM analysis of the pack's examples producing a ~300-word card persisted on the pack. Also fix the pre-existing cache-correctness bug this feature would amplify: the Redis cache key must include the resolved language and style pack id (today a cached Bangla result is served to a subsequent English request for the same team+item).

### Design decisions
1. **Resolution mirrors `resolveVoiceOptions`:** `resolveStylePack(requestPackId, teamPackId)` → fetch active pack by request id, else team default, else null; any lookup miss/inactive → null + `logger.warn`. Never a request error — a deleted pack must not break generation (matches `resolveNewsItemContext` soft-fail).
2. **Retrieval:** `fetchTopStyleExamples(packId, topicEmbedding, limit = 5)` in `contentGeneration.retrieval.ts` — fetch the pack's examples `{content, embedding, engagement_hint}` and reuse the existing pure ranking (`rankBrandVoiceExamples` generalizes; parameterize its `source` or map afterward). `FewShotExample.source` union gains `'style_pack_example'`; `formatExamples` needs no change (it renders the source label generically).
3. **Prompt structure (system message), exact block order:**
   1. role intro (existing)
   2. voice instructions (language + custom_instructions — existing)
   3. **style card block** (when present): `How this style writes:\n<card>`
   4. **style examples block**: `Style examples — write exactly in this style, tone, and rhythm:\n<formatExamples(styleExamples)>`
   5. team brand-voice examples block (existing, relabeled): `This team's own past posts — blend their terminology, audience, and product specifics:`
   6. `GROUNDING_INSTRUCTION` (existing)
   7. `RESPONSE_SHAPE_INSTRUCTION` (existing)
   `buildSystemPrompt(fewShotExamples, voiceOptions, styleContext?)` where `styleContext = { card?: string; examples: FewShotExample[] }` — optional param keeps every existing call site and test compiling unchanged.
4. **Cold-start redefinition:** the brand-neutral branch triggers only when `fewShotExamples.length === 0 && !styleContext`. A brand-new team with a pack selected gets styled output on day one — that *is* the product promise. Retrieval of team examples still skips when the team has none (`hasBrandVoiceExamples` unchanged).
5. **Cache key fix (correctness, ships here because packs multiply the blast radius):** `buildCacheKey(teamId, newsItemId, topic, language, packId)` → `content:${teamId}:${item}:${language}:${packId ?? 'none'}`. Old-format keys simply expire within 24h; no invalidation needed. The resolved (post-default) language is what goes into the key — compute the key **after** `resolveVoiceOptions`.
6. **Style-card generator is a script, not a runtime path:** `scripts/generateStyleCard.ts` — loads pack examples (cap total input ~15k chars; sample evenly when larger), one `chatCompletion` (`LLM_MODELS.standard`, temp 0.3) with a fixed instruction to produce: tone & register; sentence rhythm; hook patterns; emoji policy; Bangla/English code-switch habits; CTA habits; 3 things this style never does. Persists to `pack.style_card`, prints it for curator review. Re-runnable anytime (idempotent overwrite).
7. **Token budget sanity:** card ~400 tokens + 5 style examples (~1.5-2k tokens Bangla) + 3 team examples — well within context for every candidate content model; no truncation logic needed now (7A revisits budgets per format).

### Spec delta (capability `content-generation`)

## MODIFIED Requirements

### Requirement: Style-Pack-Conditioned Generation
`POST /content/generate` SHALL accept an optional `style_pack_id`, resolving the effective pack as request override → team default → none, ignoring (with a warning log) packs that are missing or inactive. When a pack resolves, the system prompt SHALL include the pack's style card (when present) and its top topic-similar examples as the primary style authority, ordered before the team's own brand-voice examples, and generation SHALL use styled prompting even for teams with zero brand-voice examples. When no pack resolves, behavior SHALL be identical to pre-change (including the brand-neutral cold-start path).

#### Scenario: Pack examples steer the prompt
- **WHEN** generation runs with a resolved style pack holding topic-relevant examples
- **THEN** the LLM system prompt contains the style card and pack example texts ahead of any team brand-voice examples

#### Scenario: Request override beats team default
- **WHEN** a request supplies `style_pack_id` differing from the team's default
- **THEN** the request's pack is used

#### Scenario: Dangling pack soft-fails
- **WHEN** the team's default pack was deleted
- **THEN** generation succeeds without a pack, logging a warning

#### Scenario: New team + pack is not brand-neutral
- **WHEN** a team with zero brand-voice examples generates with a pack selected
- **THEN** the styled prompt branch is used, not the brand-neutral cold-start text

### Requirement: Cache Correctness Across Language and Style
The generation cache key SHALL incorporate the resolved language and resolved style pack (or "none"), so differing language or pack for the same team and topic/news item can never serve each other's cached output.

#### Scenario: Language change bypasses stale cache
- **WHEN** a Bangla generation is cached and the same team+item is requested with `language: 'english'`
- **THEN** a fresh LLM call occurs and English output is returned

### Tasks
1. **Interface & validation**
   - [ ] 1.1 `contentGeneration.interface.ts`: `GenerateContentRequest.style_pack_id?: string`; `FewShotExample.source` gains `'style_pack_example'`
   - [ ] 1.2 `contentGeneration.validation.ts`: `style_pack_id: objectId.optional()`
2. **Retrieval & resolution**
   - [ ] 2.1 `contentGeneration.retrieval.ts`: `fetchTopStyleExamples(packId, topicEmbedding, limit = 5)` reusing the pure ranker with source `'style_pack_example'`
   - [ ] 2.2 `contentGeneration.service.ts`: `resolveStylePack(requestId, teamDefaultId)` soft-fail helper (fetch team's `default_style_pack_id` alongside `resolveVoiceOptions` — extend that fetch or add a lean team read); parallelize with existing Promise.all
3. **Prompt**
   - [ ] 3.1 `contentGeneration.prompt.ts`: `buildSystemPrompt(..., styleContext?)` per §Design-3 exact block order; cold-start condition per §Design-4; relabel the team-examples header line; `buildMessages` threads `styleContext`
4. **Cache key**
   - [ ] 4.1 `buildCacheKey(teamId, item, topic, language, packId)` per §Design-5; compute after voice/pack resolution; update both read and write sites
5. **Style-card script**
   - [ ] 5.1 `scripts/generateStyleCard.ts` + npm script `style:generate-card` per §Design-6 (include the fixed analysis prompt verbatim in the script)
6. **Tests**
   - [ ] 6.1 Prompt unit tests (`contentGeneration.prompt.test.ts`): style block order (card before examples before team examples); no-pack call sites byte-identical output to current expectations; pack-without-card renders examples only; cold-start-with-pack uses styled branch
   - [ ] 6.2 Integration (`contentGeneration.integration.test.ts`): create pack + example (mock embeds), team default set → system prompt (via `getLastChatCompletionRequest`) contains example text; request override wins; dangling pack → 200 + no style block
   - [ ] 6.3 Cache: same team+item, bangla then english → two chatCompletion calls (assert call count 2), distinct outputs returned
7. - [ ] 7.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live: seed the `programming-hero` pack (6A), run `npm run style:generate-card -- programming-hero`, read the card for sanity; generate for a real news item with the pack — **native-speaker check: output reads in the pack's register, keeps English tech terms, and does not resemble the brand-neutral baseline**; repeat with `language: 'english'` and confirm a fresh non-Bangla result (cache fix observable).
- **Definition of done:** the same news item generated (a) with no pack, (b) with `programming-hero`, produces visibly different registers, and the pack version is judged closer to the seeded writers' tone by a native speaker.
