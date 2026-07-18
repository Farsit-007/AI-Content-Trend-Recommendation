## Context

Verified against the current code (post `style-platform-aware-retrieval`):
`contentGeneration.service.ts`'s `generateContent` builds, per requested format, a `StyleContext`
inline:

```ts
const styleContext: StyleContext | undefined =
  stylePack && stylePackExamples
    ? { card: stylePack.style_card, examples: rankStyleExamples(stylePackExamples, topicEmbedding, CONTENT_FORMATS[format].preferredPlatform) }
    : undefined;
```

then calls `buildMessages(format, topic, fewShotExamples, voiceOptions, newsContext, styleContext, factSheet)`
(exported from `contentGeneration.prompt.ts`) and `chatCompletion({ model: LLM_MODELS.content, messages, temperature: 0.7 })`.
`resolveStylePack` and `resolveNewsItemContext` are private to `contentGeneration.service.ts`;
`fetchStylePackExamples`, `fetchTopBrandVoiceExamples`, `hasBrandVoiceExamples`, `rankStyleExamples`
are exported from `contentGeneration.retrieval.ts`; `getOrExtractFactSheet` from
`contentGeneration.facts.ts`; `buildMessages`/`StyleContext` from `contentGeneration.prompt.ts`;
`CONTENT_FORMATS` from `contentGeneration.formats.ts`. `chatCompletion`'s `model` parameter already
accepts any model id string — no change needed there.

`RAG-BANGLA-PLAN.md` §1.4's fluency check was never run because no tooling existed to run it
without hand-editing `LLM_MODEL_CONTENT` and eyeballing single generations one at a time — slow,
unblinded, and not reusable across model candidates or writer packs.

## Goals / Non-Goals

**Goals:**
- Give a reviewer a repeatable way to compare N candidate models on identical, production-realistic
  prompts, with model identity hidden until after scoring (blinding is the whole point — without it,
  the exercise measures reviewer bias toward "the free model" as much as actual quality).
- Reuse production prompt-assembly code for real, not a hand-copied approximation of it — verified
  by an explicit parity test, not just code review.
- Keep a single run bounded and free-tier-safe: capped matrix size, serial execution, per-cell
  failure capture that never aborts the whole run.
- Produce a durable, dated record of the decision (`docs/BANGLA-QUALITY-DECISION.md`), not just a
  console printout that disappears at the next `npm run` invocation.
- Fix the dead-failover env misconfiguration this whole investigation exists partly because of.

**Non-Goals:**
- Running the actual bake-off now — this change ships the harness and the decision-doc template;
  executing it against real candidate models and a real writer corpus, and recording the outcome, is
  the parent plan's Gate G3, gated on Track 0 (a real corpus) being in place. Verification for *this*
  change uses a scratch pack and a 1-model dry run.
- Any change to `POST /content/generate` or `/content/refine`'s runtime behavior. The harness is a
  read-only offline tool; the only behavior-affecting code is the internal extraction of
  `buildStyleContext`, which is byte-for-byte behavior-preserving (regression-tested).
- The critique-and-rewrite second pass (`--critique` mode) — that's the next change
  (`style-fidelity-critique-pass`), which extends this harness once it exists; out of scope here.
- Team-scoped brand-voice blending in the harness. See Decision 3 — deliberately excluded so the
  bake-off isolates style-pack + model quality, not a particular team's voice noise.
- A UI for viewing bake-off results — CLI + file output only, matching every other `verify:*`
  script in this codebase.

## Decisions

### 1. Extract `buildStyleContext` as a shared, pure, exported helper — not a harness-side reimplementation

New export in `contentGeneration.retrieval.ts` (co-located with `rankStyleExamples`, which it
wraps):

```ts
export const buildStyleContext = (
  format: FormatId,
  stylePack: { style_card?: string } | null,
  stylePackExamples: StyleExampleCandidate[] | null,
  topicEmbedding: number[],
): StyleContext | undefined =>
  stylePack && stylePackExamples
    ? { card: stylePack.style_card, examples: rankStyleExamples(stylePackExamples, topicEmbedding, CONTENT_FORMATS[format].preferredPlatform) }
    : undefined;
```

`generateContent`'s per-format loop replaces its inline ternary with a call to this function —
identical logic, now named and reusable. This is the one behavior-relevant code change in this
entire proposal; it's a pure refactor (same inputs → same output), proven by the full existing
`contentGeneration.integration.test.ts`/`contentGeneration.prompt.test.ts` suite passing unchanged,
plus a new explicit unit test for the extracted function itself.

Alternative considered: leave the inline logic alone and have the harness duplicate it. Rejected —
this is exactly the drift risk the proposal's "not a reimplementation" goal exists to prevent; if
someone later changes how style context is built (e.g. adding a second-platform fallback tier),
a duplicated harness silently stops reflecting production reality.

### 2. `resolveNewsItemContext` becomes shared (exported), `resolveStylePack` does not

`resolveNewsItemContext(newsItemId)` (embedding + `NewsItemContext` from a `NewsItem` id, soft-fail
on a missing id) takes no team context at all — it's already harness-compatible as-is. Move it to
`contentGeneration.retrieval.ts` (or export it directly from `contentGeneration.service.ts`; either
is fine — pick whichever keeps `service.ts`'s import graph cleanest) so the harness can resolve a
topic's optional real news item exactly like production does, including facts-then-write eligibility.

`resolveStylePack(requestPackId, teamId)` is **not** reused as-is — it resolves "by id, falling back
to a team's default," which presumes a real team. The harness resolves a pack by **slug** (a CLI
`--pack <slug>` argument is far more usable than requiring a Mongo ObjectId), which is a different,
one-line lookup (`StylePack.findOne({ slug, is_active: true })`) — not prompt-assembly logic, so
duplicating this specific two-line query in the harness is not the drift risk Decision 1 guards
against.

### 3. The harness never touches team-scoped brand-voice retrieval

`fewShotExamples` (brand voice) is always `[]` in the harness — deliberately. The bake-off's purpose
is isolating **model quality × style-pack quality**; blending in one arbitrarily-chosen team's brand
voice would confound the comparison (a model could look better or worse purely because of which
team's examples happened to be pulled in) and doesn't need a "harness team" fixture to exist in the
database. This also matches production's own cold-start behavior for a team with zero brand-voice
examples (`fewShotExamples: []`, brand-neutral-adjacent branch) — so the harness's prompts are
realistic for exactly the case Track 0's launch packs will initially serve (new teams whose voice
comes entirely from the selected style pack).

### 4. Matrix runner, shuffling, and output formatting live in one new pure-ish module

`contentGeneration.bakeoff.ts` houses:
- `shuffleWithSeed<T>(items: T[], seed: number): T[]` — deterministic (mulberry32-style inline
  PRNG, no new dependency) so a run's blinding is reproducible from its recorded seed, but a fresh
  seed per run (default: current timestamp, overridable via `--seed` for exact reproduction) keeps
  order genuinely unpredictable to a reviewer across runs.
- `runBakeoffMatrix(options): Promise<BakeoffRun>` — orchestrates: resolve pack once, fetch its
  examples once, for each topic resolve its news-item context (if any) and embed the topic text
  once; then for each `(model, topic, format)` cell, build the style context via `buildStyleContext`,
  build messages via `buildMessages`, and call `chatCompletion({ model, messages, temperature: 0.7 })`
  (same temperature as production's `generateContent`) **serially**, with a short fixed delay between
  calls and a try/catch per cell that records `{ error: string }` instead of aborting the run.
- `formatReviewMarkdown(run, shuffledOrder)` — pure formatting: one section per shuffled sample,
  labeled `Sample <letter><index>` (label carries no model information), rubric table with fixed
  anchors (Bangla correctness /5, style fidelity /5, AI-tell absence /5, factual grounding /5, and a
  forced "publish with ≤2 edits? yes/no").
- The CLI script (`scripts/banglaBakeoff.ts`) is a thin wrapper: arg parsing, `dns.setServers` +
  `mongoose.connect` boilerplate (established convention — see `generateStyleCard.ts`), call
  `runBakeoffMatrix`, write the JSON + Markdown files, print a summary, disconnect. This mirrors the
  9A precedent (`generateStyleCard.ts` reduced to a thin wrapper around a testable service function)
  — the matrix/shuffle/format logic is unit-testable without a live DB or OpenRouter call.

### 5. Caps and defaults

`--models` ≤ 4, `--topics-file` entries ≤ 8 (default file ships exactly 6), `--formats` ≤ 2
(default `facebook_post,linkedin_post` — matches the vision's explicit FB/LinkedIn focus and V10's
long-form emphasis). Worst case 4×8×2 = 64 `chatCompletion` calls in one run — bounded, and every
call is already wrapped in `chatCompletion`'s own existing failover-to-fallback-model behavior (a
transient 429 on one candidate doesn't kill that cell if the fallback model happens to succeed —
acceptable for this tool's purpose, since the JSON record still shows which model id was requested).

### 6. Default topic set: 6 topics, taxonomy-spanning, optional real news-item slot

`backend/seed/bakeoff-topics.json`: `[{ topic: string, news_item_id?: string, category_hint?: string }]`.
Ships with 2 AI, 1 Web Dev, 1 Career, 1 Security, 1 DevOps topic (matching `NEWS_CATEGORIES`),
`news_item_id` absent by default (not portable across environments/databases — a reviewer with a
real corpus can point specific topics at a real stored item to exercise facts-then-write grounding;
the committed default file intentionally runs topic-only for portability). `category_hint` is
documentation-only (not read by the harness) — it exists so a human editing the file can see why
each topic was chosen without needing DB access.

### 7. Env fix: `.env.example` already correct, `.env` is the actual bug

`.env.example` already states "Must be a genuinely different model from `LLM_MODEL_CONTENT`" with
the boot-warning explained. The live `backend/.env` sets all three role vars to the same model
(`nvidia/nemotron-3-ultra-550b-a55b:free`), which is the actual defect. Fix: pick a distinct,
currently-free OpenRouter model for `LLM_MODEL_FALLBACK` in `.env` (live-verified at apply time —
OpenRouter's free catalog changes, per this file's own existing comments). No code change; the
existing boot-time warning (`llmClient.ts`) already fires whenever the misconfiguration exists and
will confirm the fix by going silent. The harness needs no separate warning-surfacing logic beyond
this — importing `llmClient.ts` (which the harness does transitively via `chatCompletion`) already
triggers the module-level check as a side effect, so the same warning appears in the harness's own
console output for free if the misconfiguration is ever reintroduced.

### 8. `docs/BANGLA-QUALITY-DECISION.md` location and shape

Placed at the repo root, matching the existing convention for planning/decision docs
(`RAG-BANGLA-PLAN.md`, `VISION-ALIGNMENT-DEEP-ANALYSIS*.md`) rather than nested under `backend/` —
this is a product/process decision record, not API documentation (which lives in
`backend/src/app/docs/`, a different and unrelated "docs" concept). Shape: fixed rubric with
concrete anchors per score (e.g. "Bangla correctness 5 = no conjunct/grammar errors a native reader
trips on"), a review-process section (reviewer count, tie-break rule), and a decision-record table
appended after each real run (date, chosen model, score summary, free-vs-paid call). This change
ships the template with the rubric and process filled in; the decision-record table starts empty and
is appended to only when Gate G3 actually runs (outside this change's own verification, per
Non-Goals).

## Risks / Trade-offs

- **[Risk] Extracting `buildStyleContext` touches a well-tested, already-shipped hot path
  (`generateContent`).** → Mitigation: pure refactor, same inputs → same output, guarded by the
  full existing `contentGeneration.*` suite passing unchanged plus a new dedicated unit test and a
  prompt-parity integration test — the same regression-guard pattern used in
  `style-platform-aware-retrieval`.
- **[Risk] A 64-cell run against a free-tier model can hit rate limits mid-run** (already observed
  live during this plan's earlier changes' verification). → Mitigation: per-cell try/catch already
  designed to capture `{ error }` and continue (Decision 4); a reviewer re-runs later or with a
  smaller matrix — no data loss, partial results are still useful.
- **[Trade-off] The harness intentionally never exercises brand-voice blending** (Decision 3), so it
  cannot bake off "how does this model handle a team's specific brand voice + a style pack
  together." → Accepted: that's a materially different, harder-to-blind question (a team's own posts
  are inherently no-not-blindable to that team's own reviewers); out of scope for measuring
  model/pack quality specifically.
- **[Trade-off] Blinding relies on the reviewer not recognizing a model's "voice" from prior
  familiarity.** → Accepted as an inherent limitation of any blind review; mitigated by comparing
  models that are meaningfully different in provenance/size where possible, and by the forced
  "publish with ≤2 edits" binary being harder to game than a subjective 1-5 score.

## Migration Plan

No data migration. `buildStyleContext`'s extraction is the only change to already-shipped code and
is behavior-preserving (verified by regression tests before merge). Everything else is new,
additive tooling (new script, new module, new seed file, new doc) plus one environment-variable
value change in a local, gitignored `.env` file (no deployed-environment migration implied by this
change itself — whoever manages a deployed environment's `.env` applies the same one-line fix there
independently, at their own discretion). Rollback is trivial: revert the extraction commit (tests
will still pass identically either way) and/or revert the `.env` value.

## Open Questions

- None blocking implementation. Whether the bake-off's outcome favors staying free-tier or moving to
  a paid model (RAG-BANGLA-PLAN.md's original tension) is exactly what running the harness against
  Track 0's real corpus will answer — that's Gate G3, explicitly out of this change's own scope.
