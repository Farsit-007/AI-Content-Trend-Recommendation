# 9 — V7/V9 Completion: Real Writer Corpus, Intake at Scale, and "Doesn't Feel AI" Quality: OpenSpec Execution Plan

**Problem (V7/V9 in the vision):** "Using RAG we will train our ai about different bangla blogs, articles,
contents of different tones of popular bangla tech writers so that our system can produce contents like that
same styles, tone, accent in bangla… mostly Programming Hero ed tech company style… should not feel like ai
generated. Just like how our bangladeshi tech writers would have write."

**Where V7/V9 stand today (verified 2026-07-18):** the *machinery* is fully shipped — changes
`style-packs-foundation` (6A) and `style-packs-generation` (6B) are both implemented and archived
(`openspec/changes/archive/2026-07-18-style-packs-*`). `StylePack`/`StyleExample` models, super-admin CRUD +
curation UI, cosine retrieval, style-card generation script, prompt integration (card → pack examples → team
examples), per-format long-form generation with length targets, facts-then-write grounding, anti-AI-tell
instructions, refine/regenerate loop — all live. **What has never happened is everything that requires
judgment or data:** (1) no real writer content has ever been loaded (the only seed data is 3 AI-fabricated
posts in `backend/seed/style-pack.example.json`); (2) the Bangla embedding-retrieval sanity check has no
recorded verdict; (3) the model-fluency bake-off flagged as "⚠️ the critical step" in `RAG-BANGLA-PLAN.md`
§1.4 has no recorded outcome; (4) `LLM_MODEL_FALLBACK` = `LLM_MODEL_CONTENT` = `LLM_MODEL_STANDARD` in
`.env`, so failover is dead; (5) three quality levers designed in the parent analyses were deferred and never
built: platform-matched example retrieval, intake tooling that scales past copy-paste, and the optional
critique-and-rewrite pass.

**Parent analyses:** [VISION-ALIGNMENT-DEEP-ANALYSIS-2026-07-18.md](./VISION-ALIGNMENT-DEEP-ANALYSIS-2026-07-18.md)
§3.2 (how the style-pack RAG works), §5 (the corpus workflow this plan formalizes), §6 (the remaining gaps
this plan closes). Original design rationale: [VISION-ALIGNMENT-DEEP-ANALYSIS.md](./VISION-ALIGNMENT-DEEP-ANALYSIS.md)
§6 Phase D/E, §8.1-8.3 (risks). Sibling: [6-VISION-BANGLA-STYLE-PACKS-OPENSPEC-PLAN.md](./6-VISION-BANGLA-STYLE-PACKS-OPENSPEC-PLAN.md)
(fully executed — its "Verification" gates were *deferred*, not passed; this plan is where they actually get run).

**Date:** 2026-07-18

> **Execution protocol:** `/opsx:propose` → `/opsx:apply` → Verification → `/opsx:archive`, one change at a
> time. Track 0 is human/data work tracked *outside* OpenSpec but it gates two changes — read the sequence
> map (§Global sequence) before proposing anything.

---

## 0. Verified baseline (re-checked 2026-07-18 against the live tree)

Every task in this plan builds on one of these verified facts. If a fact no longer holds when you propose a
change, stop and re-verify before writing the proposal.

| Fact | Location |
|---|---|
| `StylePack { name, slug*, description?, language, tone_tags[], style_card?, is_active, created_by }` + `StyleExample { style_pack_id (indexed), content, embedding (1536 validated), platform: 'facebook'\|'linkedin'\|'other', source_ref?, engagement_hint? }` — two collections, global (no team_id) | `modules/StylePack/stylePack.model.ts` |
| Pack CRUD service: `createPack / listPacks(includeInactive, role) / getPackById (+example_count) / updatePack / deletePack (cascades examples) / addExample (server-side `embed()`) / listExamples (paginated) / deleteExample` — **no bulk-add, no near-dup guard, no card metadata** | `stylePack.service.ts` |
| Retrieval: `fetchTopStyleExamples(packId, topicEmbedding)` fetches ALL of a pack's examples, in-memory cosine-ranks, top **5** (`STYLE_EXAMPLE_LIMIT`) — **platform field is fetched but never used for filtering** | `contentGeneration.retrieval.ts:78-87` |
| Pack resolution: request `style_pack_id` → team `default_style_pack_id` → none; missing/inactive pack soft-fails with `logger.warn`, never a request error | `contentGeneration.service.ts:61-83` |
| Prompt block order when a pack resolves: intro → voice instructions → `How this style writes:\n<card>` → `Style examples — write exactly in this style, tone, and rhythm:` → team posts relabeled `blend their terminology, audience, and product specifics` → `GROUNDING_INSTRUCTION`; no-pack path byte-identical to pre-6B | `contentGeneration.prompt.ts:32-81` |
| Generation is **one `chatCompletion` per requested format** (misses computed per format, `Promise.all`), formats defined with explicit length targets (FB 150-400 words; LinkedIn 1,200-2,500 chars); text formats get `ANTI_AI_TELL_INSTRUCTION`; youtube_idea is JSON-kind and excluded from it | `contentGeneration.service.ts:171-195`, `contentGeneration.formats.ts` |
| `ANTI_AI_TELL_INSTRUCTION` exists (vary sentence lengths, concrete hooks, no formulaic closers incl. "সবশেষে বলা যায়…", no em-dash/bullet overuse) — applied at generate AND refine | `contentGeneration.prompt.ts:14-17,125` |
| Facts-then-write: `getOrExtractFactSheet` (cheap `LLM_MODELS.standard` call, 7-day Redis cache keyed on news item, 5-10 facts + 3-sentence summary, soft-fail null) runs when `news_item_id` present and `content.length >= CONTENT_FACTS_MIN_CHARS` (800) | `contentGeneration.facts.ts`, `contentGeneration.service.ts:166-169` |
| Cache key includes team, item/topic-hash, **resolved language, resolved packId, format**; `regenerate: true` bypasses reads; TTL 24h | `contentGeneration.service.ts:36-46,127-143` |
| Refine loop: `POST /content/refine` `{ team_id, format, current_text, instruction, language?, style_pack_id? }` → style-card-aware editing contract, not cached | `contentGeneration.service.ts:211-239`, `contentGeneration.prompt.ts:105-135` |
| Style-card generator: `npm run style:generate-card -- <slug>` — samples pack examples to 15k chars, one `LLM_MODELS.standard` call (fixed 7-aspect instruction), overwrites `pack.style_card`, prints for review; **logic lives only in the script** (no service, no endpoint, no generated-at metadata) | `scripts/generateStyleCard.ts` |
| Retrieval sanity script: `npm run verify:style-pack-retrieval -- <slug> "<topic>"` — embeds topic live, prints top-5 with scores, asks for a human verdict; **verdict never recorded** | `scripts/verifyStylePackRetrieval.ts` |
| Bulk seed: `npm run seed:style-pack -- <slug> <file.json> [--name] [--language]` — zod-validated `[{ content, platform?, source_ref?, engagement_hint? }]`, creates pack if missing, idempotent by **exact** content match, one `embed()` call per new example (serial) | `scripts/seedStylePack.ts` |
| `embedBatch(texts[])` exists and is the mandated pattern for high-count embedding (one HTTP call per batch; per-item `Promise.all` floods OpenRouter and intermittently fails) | `lib/embeddings.ts:34-48` |
| Seed data is 3 entries, AI-fabricated PH-imitation posts (motivational generic copy, `example.test` source_refs) — **no real writer content anywhere in the system** | `backend/seed/style-pack.example.json` |
| LLM failover: `chatCompletion` retries once on `LLM_MODELS.fallback` **unless `fallbackModel === model`** — and `.env` sets all three model vars to `nvidia/nemotron-3-ultra-550b-a55b:free`, so failover is disabled; a boot-time warning already fires | `lib/llmClient.ts:14-20,52-70`, `backend/.env:28-30` |
| Language instruction (bangla): Bengali script, keep English tech terms, never romanize | `lib/voiceProfile.ts:15-23` |
| Super-admin curation UI: create pack, add/delete examples **one textarea at a time**, retire/reactivate, delete; **style_card is neither displayed nor regenerable from the UI** | `frontend/src/pages/dashboard/admin/StylePacks.tsx` |
| Team-side UI: default-pack selector (admin-editable) in Team Settings; per-generation pack selector in Generate | `frontend/src/components/team/StylePackSection.tsx`, `frontend/src/pages/dashboard/Generate.tsx:47,57-61` |
| Auto-gen job still lacks `lifecycle: 'active'` on its NewsItem query (stale seam comment) — archived items remain draftable | `generatedContent.job.ts:42-50` |
| Test conventions: `stylePack.integration.test.ts`, `contentGeneration.prompt.test.ts`, `contentGeneration.integration.test.ts`, mocks in `__tests__/support/openrouterMock.ts` (`mockChatCompletion`, `mockEmbedding`, `getLastChatCompletionRequest`) | `backend/src/__tests__/` |
| Local-dev gotchas for every new live script: `dns.setServers(['8.8.8.8','1.1.1.1'])` before `mongoose.connect` (Windows SRV issue); Redis = `docker start growth-studio-redis` | `scripts/generateStyleCard.ts:8-12` shows the pattern |

**Non-goals (unchanged from file 6, plus new ones):** fine-tuning or self-hosting any model; automated
scraping of writer pages (collection stays manual/human — the intake tooling in 9A makes *loading* scale,
not *collecting*); public attribution of writers or exposure of `StyleExample.content` outside the
super-admin UI; per-team style packs (packs stay global); streaming/SSE generation; changing the embedding
model globally (9E, if triggered, changes what *text* gets embedded for style examples only).

---

## Global sequence

```
Track 0 (human, starts NOW, no code)  ──┬─► Gate G1 (retrieval verdict) ──► 9E only if G1 FAILS
                                        └─► Gate G2 (≥1 real pack seeded) ──► 9C bake-off ──► Gate G3 (model verdict) ──► 9D critique pass (only if G3 says "close but AI-ish")
9A intake-at-scale   — independent, parallel with Track 0 (makes Track 0 loading easier if done first, but CLI path already works)
9B platform-aware retrieval — independent, small, any time; before 9C preferred (bake-off then measures the shipped retrieval, not a moving target)
```

Recommended order for a single executor: **9B → 9A → (Track 0 completes) → 9C → decide 9D/9E from evidence.**
Track 0 starts on day one regardless — it is the long pole and it is not engineering.

Fold-in fix (do with whichever change is proposed first, as an out-of-scope-noted task or a standalone
one-liner): add `lifecycle: 'active'` to the auto-gen NewsItem query (`generatedContent.job.ts` — the seam
comment says exactly where). It is a V5 leak, not V7/V9, but it is one line and it pollutes drafts with
finished trends.

---

## Track 0 — The real writer corpus (human/data work; gates 9C and the V7 definition of done)

This is not an OpenSpec change — no code is written. It is specified here at the same rigor because **it is
the single highest-leverage item in this entire plan**: every engineering change below multiplies the
quality of this data, and none of them substitute for it.

### T0.1 Define the launch packs (product decision, ~30 min, do first)

Create each via the super-admin UI or let `seed:style-pack` auto-create on first import. Launch set:

| slug | name | language | tone_tags | Primary platform mix | What it is |
|---|---|---|---|---|---|
| `programming-hero` | Programming Hero | bangla | energetic, edtech, motivational, beginner-friendly | ~70% facebook, ~30% linkedin | The vision's explicitly named target style |
| `casual-community` | Casual Dev Community | bangla | informal, bhai-tone, relatable, humorous | ~90% facebook | Dev-community register, meme-adjacent |
| `formal-thought-leader` | Formal Thought Leader | bangla | professional, analytical, career, industry | ~90% linkedin | LinkedIn-register Bangla |
| `storyteller` | Storyteller | bangla | narrative, personal, hook-driven | ~60% facebook, ~40% linkedin | Anecdote-led long-form |

Rules: 3-5 packs at launch, never 1 (a single pack makes "different tones of popular bangla tech writers"
undemonstrable and makes the bake-off's cross-pack comparisons impossible). Add a `banglish` variant pack
later only if a team asks — the PRD/team decision of 2026-07-15 is pure Bangla script.

### T0.2 Collection protocol (the human blocker — assign an owner and a deadline)

Per pack, collect **minimum 30, target 60-100** real public posts. Quality rules, all mandatory:

1. **Real posts only.** Copy the text of actually-published public posts. Never paraphrase, never "improve",
   never generate. One fabricated example poisons both retrieval and the style card silently. (This rule
   exists because the current seed file violates it — that file must be treated as shape documentation only
   and must never be seeded into a production pack.)
2. **Category coverage.** Spread across the fixed taxonomy the feed uses — `AI`, `Web Dev`, `Career`,
   `Security`, `DevOps` (`NEWS_CATEGORIES`, `newsIngestion.interface.ts:16`) — at least 4 examples per
   category per pack. Retrieval ranks by topic similarity; a pack with only career-motivation posts has
   nothing to retrieve when the topic is a Kubernetes CVE, and generation quality silently degrades to the
   card alone.
3. **Platform tagging is not optional.** Tag every example `facebook` or `linkedin` per where it was
   actually published (9B builds on this). Use `other` only for blog excerpts.
4. **Length mix.** Include genuinely long posts (300+ words) in every pack — the system's own output targets
   are FB 150-400 words and LinkedIn 1,200-2,500 chars, and few-shots teach length as much as tone.
5. **`source_ref` = the public post URL, always.** It is the audit trail for T0.5's legal posture and the
   trace-back when a style card contains something odd.
6. **`engagement_hint` where visible**, real numbers, format `"3.1k likes, 420 comments, 210 shares"` — the
   prompt surfaces it to the model as a quality signal (`formatExamples`, `contentGeneration.prompt.ts:24-30`).
7. **Text fidelity.** Preserve emoji, line breaks, English code-switches, and hashtags exactly as published.
   Strip only: @-mentions of private individuals, phone numbers, and link-shortener URLs (replace with
   `[link]`).
8. **File format** — one JSON file per pack at `backend/seed/<slug>.json` (gitignore-check before commit:
   these files contain third-party content; keep them out of the public repo if the repo is/goes public —
   decision recorded in T0.5):

```json
[
  {
    "content": "<exact post text>",
    "platform": "facebook",
    "source_ref": "https://www.facebook.com/<page>/posts/<id>",
    "engagement_hint": "3.1k likes, 420 comments, 210 shares"
  }
]
```

### T0.3 Load + card generation (already-built commands, per pack)

```bash
cd backend
npm run seed:style-pack -- programming-hero seed/programming-hero.json --name "Programming Hero" --language bangla
npm run style:generate-card -- programming-hero     # read the printed card; sanity-check it names real habits, not generic praise
```

Re-run both whenever a meaningful batch (~10+) of new examples is added; both are idempotent. If 9A has
shipped, the bulk-import UI + regenerate-card button replace the CLI for non-technical curators.

### T0.4 Gate G1 — Bangla retrieval verdict (2-minute human check, RECORD THE OUTCOME)

After the first real pack is seeded:

```bash
npm run verify:style-pack-retrieval -- programming-hero "AI দিয়ে ওয়েব ডেভেলপমেন্ট শেখা"
npm run verify:style-pack-retrieval -- programming-hero "ক্যারিয়ার সুইচ করে প্রোগ্রামিং"
npm run verify:style-pack-retrieval -- programming-hero "নতুন JavaScript framework রিলিজ"
```

Verdict rule: for each topic, are ≥3 of the top-5 topically sensible, and do unrelated-topic queries score
visibly lower than related ones? **PASS → 9E is dead, never propose it. FAIL → propose 9E.** Write the
verdict (PASS/FAIL, date, who judged) into this file under this heading — the 6B verification deferred this
exact gate; do not defer it twice.

### T0.5 Legal/ethics posture (conscious one-time decision, record it here)

Storing public posts as internal retrieval material and distilling a style card is standard RAG practice;
the risk controls already in the architecture: examples are never republished, team-facing UI shows only
pack names, the card steers by *description* rather than reproduction. Decide and record: (a) packs stay
internal — `StyleExample.content`/`source_ref` never leave the super-admin surface (already true in code;
keep it true); (b) no public attribution of any writer; (c) takedown rule — if a writer objects, delete the
pack (cascade already deletes examples) within 48h; (d) whether `seed/<slug>.json` files are committed to
the repo or kept out of version control (recommend: out — `.gitignore` them, keep a private share).

### T0.6 Track-0 exit criteria

- ≥3 packs seeded with ≥30 real examples each, category + platform coverage per T0.2.
- Style card generated and human-reviewed for each.
- G1 verdict recorded.
- Legal posture (T0.5 a-d) recorded.

---

## Change 9A — `style-corpus-intake-at-scale`

### Proposal input (for `/opsx:propose`)

> Make loading a 30-100-example writer corpus practical for a non-CLI curator, and make style-card freshness
> visible. Backend: `POST /style-packs/:id/examples/bulk` (super_admin) accepting the same
> `[{ content, platform?, source_ref?, engagement_hint? }]` array as the seed file (≤100 per call), embedding
> via one `embedBatch` call (not per-item), skipping normalized-duplicate content (trim + whitespace-collapse
> match against existing pack examples and within the batch), returning `{ created, skipped, total }`;
> `POST /style-packs/:id/generate-card` (super_admin) that runs the existing card generation online and
> stamps new metadata `style_card_generated_at` + `style_card_example_count` on the pack (the CLI script is
> refactored to call the same extracted service function so script and endpoint can never drift). Frontend
> (super-admin StylePacks page): a bulk-import textarea/file-drop that accepts pasted JSON, client-validates,
> calls the bulk endpoint, and reports created/skipped; a style-card panel per pack showing the card text,
> when it was generated and from how many examples, a "stale" badge when the current example count differs
> from `style_card_example_count`, and a "Regenerate card" button. The seed script gains `embedBatch` and the
> same normalized-dup rule so CLI and API imports behave identically.

### Design decisions

1. **Bulk endpoint mirrors the seed-file contract exactly** (same zod shape) so a curator can hand the same
   JSON to either path. Cap 100 items/call — one `embedBatch` HTTP request stays well inside provider limits
   and `MAX_INPUT_CHARS` capping is already inside `embedBatch`.
2. **Near-dup rule is normalization, not semantics:** `content.trim().replace(/\s+/g, ' ')` equality against
   (a) existing examples in the pack, (b) earlier items in the same batch. Semantic near-dup (cosine) is
   deliberately out: two genuinely different posts about the same campaign are *good* corpus, and the 0.88
   news-dedup threshold has no calibration meaning for style examples. Exact-after-normalization catches the
   real failure (same post pasted twice from FB with different whitespace).
3. **Card generation extracts to `stylePack.cardService.ts` (or a `generateCardForPack(packId)` in the
   existing service):** load examples → `sampleWithinBudget` (move from the script) → fixed 7-aspect analysis
   prompt (move verbatim) → `chatCompletion(LLM_MODELS.standard, temp 0.3)` → persist
   `style_card`, `style_card_generated_at: new Date()`, `style_card_example_count: <count used>`. Script
   becomes a thin CLI wrapper (connect → call → print). Endpoint is synchronous (one LLM call, same latency
   class as `/content/refine` — no job infrastructure).
4. **Staleness is derived client-side** (`example_count !== style_card_example_count` or card absent) — no
   server-side flag to keep in sync. `getPackById` already returns `example_count`; add the two new fields to
   its projection and to the list response.
5. **New model fields are optional** — zero migration; existing packs render as "card never generated" until
   the first regenerate.
6. **Validation limits:** per-example `content` 1..8000 chars (matches existing single-add), batch 1..100,
   whole-body size guard via express json limit already in place.
7. **Fold-in (one line, noted in tasks):** `lifecycle: 'active'` added to `generatedContent.job.ts`'s
   NewsItem query. Out of the spec delta's capability but shipped and tested in this change to stop archived
   items being drafted nightly.

### Spec delta (capability `style-packs`)

## ADDED Requirements

### Requirement: Bulk Example Import
super_admins SHALL be able to import up to 100 style examples for a pack in one request, using the same
item shape as the seed file. The system SHALL embed the batch in a single embeddings call, SHALL skip items
whose whitespace-normalized content already exists in the pack or earlier in the same batch, and SHALL
report created and skipped counts. Invalid items SHALL reject the whole request with a validation error
identifying the offending index.

#### Scenario: Mixed batch imports cleanly
- **WHEN** a super_admin posts 40 items of which 5 duplicate existing examples after whitespace normalization and 2 duplicate each other within the batch
- **THEN** 34 examples are created with embeddings, the response reports `{ created: 34, skipped: 6 }`, and exactly one embeddings call was made

#### Scenario: Non-super_admin rejected
- **WHEN** an admin or user calls the bulk endpoint
- **THEN** HTTP 403

### Requirement: Style Card Lifecycle Visibility
A pack SHALL record when its style card was generated and from how many examples. super_admins SHALL be able
to (re)generate the card via an API endpoint sharing the same implementation as the CLI script. Pack reads
SHALL expose card text, generated-at, and generation-time example count so a client can present staleness.

#### Scenario: Regeneration updates metadata
- **WHEN** a pack has 50 examples and a super_admin calls generate-card
- **THEN** the pack's card is overwritten and reads return `style_card_generated_at` (fresh) and `style_card_example_count: 50`

#### Scenario: Empty pack cannot generate a card
- **WHEN** generate-card is called for a pack with zero examples
- **THEN** the request fails with a client error and the pack is unchanged

### Tasks

1. **Model & interface**
   - [ ] 1.1 `stylePack.interface.ts` / `stylePack.model.ts`: `style_card_generated_at?: Date`, `style_card_example_count?: number`
2. **Card service extraction**
   - [ ] 2.1 Move `sampleWithinBudget` + `ANALYSIS_INSTRUCTION` + the generation call from `scripts/generateStyleCard.ts` into the StylePack service (`generateCardForPack(packId)` — throws NOT_FOUND on missing pack, BAD_REQUEST on zero examples; persists card + metadata; returns the card)
   - [ ] 2.2 Rewrite `scripts/generateStyleCard.ts` as a thin wrapper (keep CLI contract + dns/connect boilerplate)
3. **Bulk import**
   - [ ] 3.1 `stylePack.validation.ts`: bulk schema (array 1..100 of the existing example shape)
   - [ ] 3.2 Service `addExamplesBulk(packId, items)`: normalize-dedupe against pack + intra-batch → `embedBatch` on survivors → `insertMany` → `{ created, skipped, total }`
   - [ ] 3.3 Controller + route `POST /:id/examples/bulk` (requireAuth, requireSuperAdmin); route `POST /:id/generate-card` likewise
   - [ ] 3.4 `scripts/seedStylePack.ts`: switch to the same normalize-dup rule and `embedBatch` (chunk ≤100)
4. **Docs**
   - [ ] 4.1 `docs/stylePackPaths.ts` + `docs/schemas.ts`: both new endpoints
5. **Frontend (super-admin StylePacks page)**
   - [ ] 5.1 `lib/api/stylePacks.ts`: `bulkAddExamples(packId, items)`, `generateCard(packId)`; extend `StylePackDto` with the two card-metadata fields
   - [ ] 5.2 Bulk-import UI in `PackExamples`: JSON paste area (or file input reading to text) → client zod-ish validation → call → toast `created/skipped`; keep single-paste path
   - [ ] 5.3 Style-card panel in `PackRow` expanded view: card text (collapsible), "Generated <date> from <n> examples", stale badge when counts differ or card missing, Regenerate button with pending state
6. **Fold-in fix**
   - [ ] 6.1 `generatedContent.job.ts`: add `lifecycle: 'active'` to the NewsItem query (replace the stale seam comment); integration-test that an archived item is not drafted
7. **Tests**
   - [ ] 7.1 `stylePack.integration.test.ts`: bulk happy path incl. single-embedBatch assertion (mock call count), normalized-dup skipping (intra-batch + vs existing), 100-cap validation, 403 for non-super_admin
   - [ ] 7.2 generate-card endpoint: metadata stamped; zero-example → 400; script wrapper still passes existing behavior (if a script test exists, else covered by service test)
8. - [ ] 8.1 `cd backend && npm test && npm run build`; `cd frontend && npm run build && npm run lint`

### Verification

- `npm test` + both builds clean.
- Live: paste a 40-item JSON into the new UI for a scratch pack → counts match; re-paste → all skipped.
  Click Regenerate card → card + "generated from 40 examples" renders; add one example → stale badge appears.
- Auto-gen fold-in: archive a news item, run the auto-gen admin trigger, confirm no draft was created from it.

---

## Change 9B — `style-platform-aware-retrieval`

### Proposal input (for `/opsx:propose`)

> When generating a specific format with a style pack, prefer the pack's examples from the matching platform:
> `facebook_post` / `facebook_reel_script` / `caption` prefer `platform: 'facebook'`; `linkedin_post` prefers
> `'linkedin'`; `youtube_idea` has no preference. Preference, not filter: rank platform-matched examples
> first (top-K from matches), then backfill to the existing limit of 5 from the remainder by similarity, so
> a pack thin on one platform degrades to today's behavior instead of an empty style block. Because
> generation already runs one LLM call per format, retrieval moves inside the per-format path for style
> examples — the topic embedding and brand-voice retrieval stay computed once per request. Cache keys already
> include format, so no cache change. Brand-voice example retrieval is untouched (team corpora are small and
> platform-mixed by design).

### Design decisions

1. **Mapping lives beside the format definitions:** add `preferredPlatform?: 'facebook' | 'linkedin'` to
   `ContentFormatDefinition` (`contentGeneration.formats.ts`) — `facebook_post`/`facebook_reel_script`/`caption`
   → `'facebook'`, `linkedin_post` → `'linkedin'`, `youtube_idea` → undefined. Single source of truth; a
   future `instagram_post` format states its preference in one place.
2. **Two-stage rank, one fetch.** `fetchTopStyleExamples(packId, topicEmbedding, preferredPlatform?)`: still
   fetch all pack examples once (adding `platform` to the projection); rank matches by similarity, take up
   to 5; if fewer than 5, backfill highest-similarity non-matches. `platform: 'other'` counts as non-match
   (backfill tier). Pure-ranking helper stays testable without Mongo (mirror `rankStyleExamples` — add a
   `rankStyleExamplesWithPlatform` or extend with an optional arg defaulting to old behavior so existing
   tests compile unchanged).
3. **Per-format style retrieval, shared everything else.** In `generateContent`'s miss loop, style examples
   are computed per format (cheap: ranking is in-memory; the DB fetch can be hoisted once and passed to the
   ranker per format). Brand-voice examples and fact sheet remain request-level. Do **not** re-fetch pack
   examples per format — fetch once, rank per format.
4. **Refine path unchanged** — it uses only the style card, not examples (`buildRefineMessages`), which is
   correct: refine edits existing text and needs register rules, not few-shots.
5. **No behavior change without a pack** and no change when every example lacks platform tags (all `'other'`
   → backfill tier → identical top-5 to today). Explicit test for both.

### Spec delta (capability `content-generation`)

## MODIFIED Requirements

### Requirement: Platform-Matched Style Retrieval
When a style pack is active, per-format generation SHALL prefer style examples whose platform matches the
format's preferred platform (facebook formats → facebook examples, linkedin_post → linkedin examples),
backfilling by topic similarity from the pack's remaining examples up to the retrieval limit when matches
are insufficient. Formats with no preferred platform and packs with no platform-tagged examples SHALL
retrieve exactly as before this change.

#### Scenario: LinkedIn generation prefers linkedin examples
- **WHEN** a pack holds 10 facebook and 3 linkedin examples and `linkedin_post` is generated
- **THEN** the prompt's style examples lead with the 3 linkedin examples (similarity-ordered) backfilled to 5 with the best facebook/other examples

#### Scenario: Untagged corpus degrades to pure similarity
- **WHEN** every example in the pack has platform `other`
- **THEN** the selected examples are identical to pure similarity ranking

### Tasks

1. - [ ] 1.1 `contentGeneration.formats.ts`: `preferredPlatform` per §Design-1
2. - [ ] 2.1 `contentGeneration.retrieval.ts`: projection adds `platform`; two-stage rank per §Design-2 (pure helper + fetch wrapper signature `(packId, topicEmbedding, preferredPlatform?)`)
3. - [ ] 3.1 `contentGeneration.service.ts`: hoist one pack-example fetch; per-format ranking wired into the miss loop; `StyleContext.examples` built per format
4. **Tests**
   - [ ] 4.1 Pure ranker unit tests: preference ordering, backfill, all-`other` equivalence, empty-match fallthrough
   - [ ] 4.2 Integration: two formats in one request receive different style example sets in their prompts (via `getLastChatCompletionRequest`-style capture per call); no-pack requests byte-identical prompts to current fixtures
5. - [ ] 5.1 `cd backend && npm test && npm run build`

### Verification

- Tests + build clean.
- Live (needs a Track-0 pack with real platform tags): generate FB + LinkedIn for the same news item with
  `programming-hero`; inspect logs/captured prompts — FB call carries facebook-tagged examples, LinkedIn call
  carries linkedin-tagged ones. Native-speaker spot check: LinkedIn output register visibly more formal than
  FB output for the same topic (this is the observable point of the change).

---

## Change 9C — `bangla-quality-bakeoff-harness`

### Proposal input (for `/opsx:propose`)

> Build the evaluation harness that finally closes `RAG-BANGLA-PLAN.md` §1.4 ("the critical step" — never
> run) and produces a recorded, evidence-based model decision for `LLM_MODEL_CONTENT`. New script
> `npm run verify:bangla-bakeoff -- --models <id,id,...> --pack <slug> [--topics-file <json>] [--formats facebook_post,linkedin_post]`:
> for each model × topic × format it drives the REAL production prompt path (resolve pack → retrieve
> examples → buildMessages — imported from `ContentGeneration`, not reimplemented) with the model overridden
> per candidate, and writes (a) a machine-readable `bakeoff-<timestamp>.json` of every generation with full
> params, and (b) a blinded, randomized-order reviewer file `bakeoff-<timestamp>-review.md` where each sample
> is labeled only `Sample A7` (model names withheld, mapping kept in the JSON) with a scoring rubric table
> per sample: Bangla correctness /5, style fidelity to the pack /5, AI-tell absence /5, factual grounding
> /5, plus a forced "would you publish this with ≤2 edits? yes/no". Also in this change: separate the LLM
> role envs in `.env`/`.env.example` so failover is real (`LLM_MODEL_FALLBACK` documented as MUST differ from
> the other two, with the boot warning upgraded to also surface in the bake-off preamble), and a
> `docs/BANGLA-QUALITY-DECISION.md` template where the outcome (chosen model, date, reviewer, scores summary,
> free-vs-paid decision) gets recorded. The script never touches the request-serving config — model override
> is a parameter to the harness's own chatCompletion calls only.

### Design decisions

1. **Reuse the production path or the results are fiction.** The harness imports `resolveStylePack`-
   equivalent reads, `fetchTopStyleExamples`/`fetchTopBrandVoiceExamples` (or drives them through a thin
   export), and `buildMessages` — the only divergence from production is which model id goes into
   `chatCompletion`. If refactoring is needed to make `buildMessages` reachable with an explicit model,
   prefer exporting a small pure helper over duplicating prompt assembly in the script.
2. **Blinding is mandatory, not a nicety.** Reviewer bias toward/against "the free model" is exactly the
   noise this exists to remove. Sample order shuffled once (seeded RNG, seed stored in the JSON), labels
   are `<letter><number>` with no model correlation.
3. **Default topic set ships in-repo** (`backend/seed/bakeoff-topics.json`): 6 topics spanning the taxonomy
   — 2 AI, 1 Web Dev, 1 Career, 1 Security, 1 DevOps — each optionally with a real `news_item_id` slot so
   facts-then-write is exercised when the DB has a matching item; topics without one run topic-only (both
   paths matter).
4. **Cost/rate safety:** serial execution with a small delay between calls (free-tier 429s are the known
   failure mode); `--models` capped at 4, topics at 8, formats at 2 by default → worst case 64 calls.
   Failures per cell are recorded as `error` in the JSON, never abort the run.
5. **Env split ships here** because a bake-off with dead failover mid-run wastes reviewer time:
   `.env.example` gains the three-role documentation and a REQUIRED-to-differ note for fallback; `.env`
   gets a distinct free fallback (executor picks a currently-free OpenRouter model at apply time — verify
   live, the catalog shifts). No code change needed beyond (optionally) elevating the existing boot warning
   to `logger.error` — keep it a warning; the doc + bake-off preamble carry the enforcement.
6. **The decision doc is part of done.** The change is not "script exists"; it is "script exists AND
   `docs/BANGLA-QUALITY-DECISION.md` template exists with the process written down". Actually *running* the
   review needs Track 0 (Gate G2) and a native speaker — the recorded outcome is this change's
   *verification*, mirroring how 6A's verification demanded a recorded retrieval verdict.
7. **Rubric (fixed in the template):** each /5 anchor described concretely (e.g. Bangla correctness 5 = "no
   conjunct/grammar errors a native reader trips on"; AI-tell 5 = "reviewer cannot point at a sentence and
   say 'that's a bot'"). The "publish with ≤2 edits" boolean is the headline metric — it is the vision's own
   bar ("just click, tweak, copy paste").

### Spec delta (capability `content-generation`)

## ADDED Requirements

### Requirement: Bangla Quality Bake-off Harness
The system SHALL provide an offline harness that generates content for a configurable matrix of candidate
models, topics, and formats through the production prompt path (style pack retrieval, brand voice, facts
grounding, format instructions identical to serving), recording every output with full parameters and
emitting a blinded, shuffled reviewer document with a fixed scoring rubric. The harness SHALL NOT alter
serving configuration, SHALL cap matrix size, SHALL run serially with rate-limit tolerance, and SHALL record
per-cell failures without aborting.

#### Scenario: Blinded review file
- **WHEN** the harness runs with 3 models and 4 topics for 2 formats
- **THEN** the review markdown contains 24 samples in shuffled order labeled without model identity, and the JSON output maps labels to models, prompts, and parameters

#### Scenario: Production-path fidelity
- **WHEN** a harness generation and a live `POST /content/generate` run with the same team, pack, topic, and format
- **THEN** their system and user prompts are identical (model id excepted)

### Requirement: Distinct Failover Model
Environment documentation SHALL define the three LLM role variables and require `LLM_MODEL_FALLBACK` to
differ from both others; the boot warning for an identical fallback SHALL remain, and the bake-off preamble
SHALL surface the same condition.

#### Scenario: Misconfiguration surfaced
- **WHEN** the bake-off starts while `LLM_MODEL_FALLBACK` equals `LLM_MODEL_CONTENT`
- **THEN** the run preamble prints the misconfiguration warning

### Tasks

1. **Harness**
   - [ ] 1.1 `scripts/banglaBakeoff.ts` + npm script `verify:bangla-bakeoff` (dns/connect boilerplate; arg parsing per proposal; caps per §Design-4)
   - [ ] 1.2 Export/refactor whatever minimal seam `ContentGeneration` needs so the script assembles prompts via production code (no prompt duplication) with a caller-supplied model id
   - [ ] 1.3 Outputs: `bakeoff-<ts>.json` (all cells, seed, env snapshot minus secrets) + `bakeoff-<ts>-review.md` (blinded, rubric table per sample) written to `backend/bakeoff-results/` (gitignored)
   - [ ] 1.4 `seed/bakeoff-topics.json` default set per §Design-3
2. **Env & docs**
   - [ ] 2.1 `.env.example`: three-role LLM documentation + fallback-must-differ; `.env`: set a distinct verified-free fallback model
   - [ ] 2.2 `docs/BANGLA-QUALITY-DECISION.md`: rubric with anchors, review process (who, how many reviewers, how ties break), decision record template (model, scores, free-vs-paid call, date)
3. **Tests**
   - [ ] 3.1 Unit: shuffle determinism by seed; blinding (review md contains no model ids); matrix caps enforced; per-cell error captured without abort (mock chatCompletion throwing for one cell)
   - [ ] 3.2 Prompt-parity test: prompt assembled by the harness seam === prompt assembled by the service path for identical inputs
4. - [ ] 4.1 `cd backend && npm test && npm run build`

### Verification

- Tests + build clean; dry run with `--models <current-model>` only (1×2×2 cells) against a scratch pack
  completes and both files render correctly.
- **Gate G3 (requires Track 0 done):** full run with 3-4 candidates over the real `programming-hero` pack;
  native-speaker review; outcome recorded in `docs/BANGLA-QUALITY-DECISION.md`. **Decision rule:** if the
  best free model's "publish with ≤2 edits" rate ≥ 60% and Bangla correctness averages ≥ 4, keep free tier
  and record it; otherwise the doc records the recommended paid model and the env change is made (one line,
  no code). If the best model scores well on Bangla but poorly on AI-tell → that is the trigger for 9D.

---

## Change 9D — `style-fidelity-critique-pass` (conditional — only on G3's "close but AI-ish" outcome)

### Proposal input (for `/opsx:propose`)

> Add an optional second-pass humanization step to text-format generation: when enabled
> (`CONTENT_CRITIQUE_ENABLED=true`, default false) and a style pack is active, after a text format is
> generated a critique-and-rewrite call (same content model) receives the draft, the style card, and a fixed
> instruction to find AI-sounding sentences (formulaic openers/closers, uniform sentence rhythm, abstraction
> padding, unnatural Bangla collocations) and rewrite ONLY those in the pack's register, preserving facts,
> length band, language, hashtags, and structure — returning only the revised text. Soft-fail: any error or
> empty/degenerate result keeps the first-pass draft (log a warning), never a request failure. The pass runs
> before caching so the cached value is the final text; `youtube_idea` and no-pack generations are exempt;
> refine (`/content/refine`) is exempt (the user is already hand-steering there). Config additionally caps
> the pass to specific formats (`CONTENT_CRITIQUE_FORMATS`, default `facebook_post,linkedin_post`). Ship a
> before/after capture in the bake-off harness (`--critique both` mode generating each cell with and without
> the pass) so the flag's value is measured, not assumed, before ever enabling it by default.

### Design decisions

1. **Off by default, evidence-gated.** This doubles per-format latency and token cost; the bake-off's
   `--critique both` mode exists precisely so the enable decision is a measured delta on the same rubric
   (AI-tell score with vs without), recorded in `docs/BANGLA-QUALITY-DECISION.md`.
2. **Rewrite-only-what's-flagged contract** (not "rewrite the post"): the instruction demands minimal edits,
   mirroring `REFINE_EDITING_CONTRACT`'s conservatism — wholesale rewrites regress style fidelity because the
   second pass sees the card but not the few-shot examples (deliberate: keeping the critique prompt small is
   what keeps the pass affordable; the card carries the register).
3. **Placement:** inside the per-format miss path in `generateContent`, after parse success, before
   `redis.setex`. Cache stores the post-critique text — a cache hit must never re-run the pass.
4. **Degenerate-output guards:** result empty, or length outside 0.5×-1.6× of the draft, or language flipped
   (cheap heuristic: Bangla-script char ratio changes by >50%) → keep the draft, log. These are unit-testable
   pure checks (`critiqueGuards.ts` or colocated).
5. **No spec change to refine/regenerate semantics.** `regenerate: true` naturally re-runs the pass (it is
   part of the miss path).

### Spec delta (capability `content-generation`)

## ADDED Requirements

### Requirement: Optional Critique-and-Rewrite Pass
When the critique flag is enabled and a style pack is active, text-format generation SHALL run a second
model pass that minimally rewrites AI-sounding sentences in the pack's register, preserving facts, language,
length band, and structure. The pass SHALL apply only to configured formats, SHALL be skipped for JSON-kind
formats, no-pack generations, and the refine endpoint, SHALL soft-fail to the first-pass draft on any error
or degenerate output, and SHALL complete before the result is cached.

#### Scenario: Flag off is byte-identical
- **WHEN** `CONTENT_CRITIQUE_ENABLED` is false
- **THEN** generation behavior and outputs are identical to pre-change

#### Scenario: Degenerate rewrite discarded
- **WHEN** the critique call returns text 3× the draft length
- **THEN** the first-pass draft is returned and cached, with a warning logged

#### Scenario: Cached results skip the pass
- **WHEN** a second identical request hits the cache
- **THEN** no critique call occurs

### Tasks

1. - [ ] 1.1 Config: `CONTENT_CRITIQUE_ENABLED` (bool, default false), `CONTENT_CRITIQUE_FORMATS` (csv, default `facebook_post,linkedin_post`) in `config/index.ts` + `.env.example`
2. - [ ] 2.1 `contentGeneration.critique.ts`: fixed critique system prompt (style card interpolated), guards per §Design-4, `critiqueText(draft, card, voiceOptions)` soft-fail wrapper
3. - [ ] 3.1 Service wiring per §Design-3 (miss path only, pre-cache, pack+flag+format gated)
4. - [ ] 4.1 Bake-off: `--critique both` mode (9C harness) emitting paired samples labeled independently (blinding preserved)
5. **Tests**
   - [ ] 5.1 Flag off → zero extra chatCompletion calls (call-count assertion); flag on + pack → exactly one extra per text format; youtube_idea/no-pack/refine exempt
   - [ ] 5.2 Guard units: length band, script-ratio, empty; soft-fail path returns draft
   - [ ] 5.3 Cache: critique output is what's cached; hit path makes no critique call
6. - [ ] 6.1 `cd backend && npm test && npm run build`

### Verification

- Tests + build clean.
- Bake-off `--critique both` over the real pack → native-speaker compares pairs blind. **Enable-by-default
  decision recorded:** AI-tell score improves by ≥1 point median without style-fidelity regression → flip the
  env default in `.env.example` and record; otherwise leave off and record why (the flag remains a per-deploy
  option either way).

---

## Change 9E — `style-example-topic-summary-embeddings` (conditional — only if Gate G1 FAILS)

### Proposal input (for `/opsx:propose`)

> Retrieval fallback for the case where `text-embedding-3-small` ranks Bangla style examples poorly
> (Gate G1 failure): at example creation (single, bulk, and seed paths), an LLM call
> (`LLM_MODELS.standard`, temp 0.2) extracts a 1-2 sentence ENGLISH topic summary of the post; the stored
> embedding is computed from that summary instead of the raw Bangla content, and the summary is persisted as
> `topic_summary` for auditability. Existing examples are re-embedded by a one-off migration script
> (`npm run migrate:style-example-embeddings`) that processes packs one at a time with `embedBatch`.
> Retrieval code is untouched (topic queries were always English-leaning news titles — that asymmetry is the
> bug this fixes). The style card generator and prompt few-shots continue to use the raw Bangla `content`
> (only the retrieval vector changes). Summary extraction soft-fails to embedding the raw content (current
> behavior) with a `embedding_source: 'content' | 'topic_summary'` marker so a partial-failure corpus is
> inspectable.

### Design decisions

1. **Do not propose this unless G1 fails.** If retrieval already ranks sensibly, this change adds an LLM
   call per example import for nothing. The G1 verdict line in Track 0 is the authorization.
2. **Only style-example embeddings change.** Brand-voice examples (team corpora, tiny, same-language queries
   more likely) and news embeddings (calibrated 0.88 dedup threshold depends on them) are explicitly out.
3. **Marker field makes mixed states safe:** `embedding_source` tells `verify:style-pack-retrieval` (extend
   its output with the marker) and the migration script what still needs processing; migration is idempotent
   by skipping `topic_summary`-sourced rows.
4. **G1 re-verdict is the exit gate:** after migration, the same three-query check from T0.4 must PASS;
   record the second verdict.

*(Spec delta and task breakdown to be written at propose time if triggered — the shape mirrors 9A's service
touchpoints: validation unchanged, `addExample`/`addExamplesBulk`/seed script gain the summary step, one
migration script, retrieval verify script prints markers. Kept summary-level here deliberately: writing full
tasks for a change that G1 will probably kill is planning waste.)*

---

## Definition of done for V7 + V9 (the whole plan)

V7 and V9 are DONE when all of the following are true and recorded:

1. **Corpus:** ≥3 packs, ≥30 real examples each, category+platform coverage per T0.2, cards generated
   (Track 0 exit criteria met).
2. **Retrieval:** Gate G1 verdict recorded as PASS (directly, or after 9E).
3. **Model:** Gate G3 executed — `docs/BANGLA-QUALITY-DECISION.md` records the chosen `LLM_MODEL_CONTENT`,
   its scores, and the free-vs-paid decision; `.env` matches the decision; fallback model is distinct.
4. **The vision's own test, run blind:** a native speaker is shown, for the same 3 news items, (a) output
   generated with the `programming-hero` pack and (b) 3 real PH posts on comparable topics, shuffled — and
   cannot reliably separate them better than chance, OR rates every generated sample "publishable with ≤2
   edits". This is the operational meaning of "should not feel like ai generated, just like how our
   bangladeshi tech writers would have write."
5. **Quality levers measured:** 9B shipped (platform-matched retrieval observable in prompts); 9D's
   enable/off decision made from paired bake-off evidence, not assumption.

Items that look related but are explicitly NOT part of this done-ness (tracked elsewhere): custom category
taxonomy matching (report §6.5), chat-answer styling, any frontend work beyond 9A's curation panel.
