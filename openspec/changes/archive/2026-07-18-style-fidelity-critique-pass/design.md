## Context

Verified against the current code (post `bangla-quality-bakeoff-harness`):
`contentGeneration.service.ts`'s `generateContent` miss-handling loop, per requested format:
builds `styleContext` via `buildStyleContext(format, stylePack, stylePackExamples, topicEmbedding)`,
builds `messages` via `buildMessages(...)`, calls
`chatCompletion({ model: LLM_MODELS.content, messages, temperature: 0.7 })`, parses the result, then
(after the whole `Promise.all` of formats resolves) writes every format's result to Redis via
`redis.setex(cacheKeysByFormat.get(format), CONTENT_TTL, JSON.stringify(value))`.
`contentGeneration.prompt.ts` already has `ANTI_AI_TELL_INSTRUCTION` (vary sentence lengths, no
formulaic closers, concrete over abstract) applied to every text-kind format's first-pass generation,
and a `REFINE_EDITING_CONTRACT` pattern (`/content/refine`'s system prompt: "change no more than the
instruction requires... return ONLY the revised text") that this change's critique pass mirrors.
`CONTENT_FORMATS` (`contentGeneration.formats.ts`) already tags `kind: 'text' | 'json'` per format —
`youtube_idea` is the only `'json'` format. `config/index.ts` follows a consistent pattern: a zod
`z.string().default('...')` entry in the raw env schema, parsed into a typed value in the derived
config object (e.g. `NEWS_CONTENT_FETCH_ENABLED: z.string().default('true')` →
`enabled: env.NEWS_CONTENT_FETCH_ENABLED === 'true'`).

`bangla-quality-bakeoff-harness`'s `runBakeoffMatrix` builds each cell's prompt via the same
`buildStyleContext`/`buildMessages` seam as live generation and calls `chatCompletion` once per cell;
extending it to optionally run a second, critiqued generation per cell is a natural addition to that
existing loop.

## Goals / Non-Goals

**Goals:**
- Provide a mechanism to reduce "AI-tell" in generated text without touching first-pass generation,
  so the two are independently measurable.
- Make the feature genuinely optional and cheap to reason about: off by default, scoped to specific
  formats, degrades to first-pass output on any failure or suspicious result.
- Give the bake-off harness a way to produce paired (with/without critique) evidence for the same
  cell, so enabling this by default is an evidence-based decision, not a guess — directly addressing
  that this change is being proposed ahead of Gate G3 rather than after it (see proposal.md's Why).
- Keep the critique prompt small and cheap (draft + style card only, no few-shot examples) — the
  card already carries the register; re-sending 3-5 few-shot examples would roughly double the
  request's token cost for a pass whose job is a light touch-up, not a rewrite.

**Non-Goals:**
- Enabling the pass by default in this change. That decision belongs in
  `BANGLA-QUALITY-DECISION.md` once `--critique both` evidence exists — explicitly out of scope
  here, matching how `bangla-quality-bakeoff-harness` scoped *running* the real bake-off out of its
  own verification.
- A per-request override (`critique: true` on `POST /content/generate`). The flag is server-side
  config, not a request parameter — this is an operational/cost lever for whoever runs the
  deployment, not a per-generation user choice; adding request-level control multiplies the cache-key
  and testing surface for a feature that isn't even proven valuable yet. Revisit only if evidence
  shows per-team variance in whether critique helps.
- Any change to `/content/refine`'s behavior — explicitly exempted (see Decision 1).
- A UI toggle or admin control for the flag — it's an `.env` value, consistent with how every other
  content-generation tuning knob in this codebase (`CONTENT_FACTS_MIN_CHARS`,
  `NEWS_CONTENT_FETCH_ENABLED`, etc.) is controlled.
- Multiple critique passes / iterative refinement loops — one pass, one decision (keep or discard),
  full stop.

## Decisions

### 1. Scope: text formats with a resolved pack, excluding refine

The pass applies only when **all** of: (a) `CONTENT_CRITIQUE_ENABLED=true`, (b) the format is in
`CONTENT_CRITIQUE_FORMATS` (default `facebook_post,linkedin_post` — the vision's own FB/LinkedIn
focus), (c) `CONTENT_FORMATS[format].kind === 'text'` (excludes `youtube_idea` structurally, not
just by omission from the default list — a JSON object has no "AI-tell sentences" to rewrite), and
(d) a style pack resolved for this request (`stylePack !== null`) — without a pack there's no style
card to check fidelity against, and the critique instruction would have nothing concrete to steer by
beyond "sound more human," which is exactly the kind of vague instruction that produces generic
rewrites rather than targeted ones.

`/content/refine` is exempted entirely, not just left off by omission: a user calling refine has
already hand-steered the text with a specific instruction ("shorter", "more casual"); an automatic
second pass re-critiquing their explicitly-requested edit would fight the user's own intent and
violate refine's existing `REFINE_EDITING_CONTRACT` ("change no more than the instruction requires").

### 2. Rewrite-only-what's-flagged contract, mirroring `REFINE_EDITING_CONTRACT`'s conservatism

The critique prompt instructs: identify sentences that read as AI-generated (formulaic
openers/closers, uniform sentence rhythm, generic abstraction, marketing-voice padding) and rewrite
**only those**, preserving every fact, the language, the approximate length, and the overall
structure. This is deliberately not "rewrite the post to sound better" — a full rewrite risks
drifting from the first pass's grounding (facts, length band) and from the style pack's fidelity in
ways a second, smaller model call can't re-verify from scratch (it only sees the draft + the card,
not the original few-shot examples or fact sheet — Decision 3 explains why that's an intentional
budget trade-off, not an oversight).

### 3. Critique prompt sees the draft and the style card, not the original few-shots or fact sheet

Alternative considered: re-send everything the first pass saw (few-shot examples, fact sheet,
grounding instruction) so the critique call has full context. Rejected for cost: that roughly
doubles token spend per critiqued format (the whole point of a "light second pass" is to *not* cost
as much as a second full generation). The style card is a deliberately compact (~300-word) summary
of exactly the fidelity signal the critique needs; the draft already embeds whatever facts/length the
first pass settled on, and the contract in Decision 2 explicitly forbids adding new facts — so there
is nothing in the fact sheet the critique pass is allowed to use that isn't already reflected in the
draft it's editing.

### 4. Degenerate-output guards, pure and unit-testable

Before accepting a critique result, three cheap checks run (any failure → discard, keep the
first-pass draft, log a warning — never a request error):
- **Non-empty**: trimmed result has non-zero length.
- **Length band**: result length is within 0.5x-1.6x of the draft's length (asymmetric on purpose —
  a legitimate edit removing a formulaic closer can shrink meaningfully; a critique that *doubles*
  length has almost certainly turned into a rewrite, violating Decision 2's contract).
- **Script-ratio stability**: for `language: 'bangla'`, the proportion of Bangla-script characters in
  the result must not drop by more than 50% relative to the draft (a cheap proxy for "the critique
  pass didn't flip the output back toward English" — matches the diagnostic rule already documented
  in `BANGLA-QUALITY-DECISION.md`: "language drift → strengthen the prompt line," here caught as a
  guard rather than trusted to the prompt alone). For `english`/`banglish`, this specific check is
  skipped (the ratio has no meaningful target for those languages).

These guards live in `contentGeneration.critique.ts` as small, pure, independently testable
functions — not inline in the service — so their behavior can be asserted with plain unit tests
(no mocked LLM needed) and reused unchanged by the bake-off harness's `--critique both` mode.

### 5. Placement in the service: after parse, before cache write, miss-path only

Runs inside `generateContent`'s per-format `misses.map(...)` callback, immediately after
`parseFormatValue` succeeds and before that format's result is written to `results`/cached. A
`regenerate: true` request naturally re-runs the pass (it's part of the existing miss path — no
special-casing needed). A cache hit never invokes the critique call, since the cached value already
reflects whatever the pass produced (or didn't) at write time — this is the same reasoning already
applied to the fact sheet and style context in this file: whatever varies the output must happen
before the cache boundary, never after.

### 6. Bake-off `--critique both` mode: two independently blinded samples per cell, not a paired display

When `--critique both` is passed, `runBakeoffMatrix` generates each `(model, topic, format)`
combination twice — once through the normal path, once through the critique pass — producing two
separate `BakeoffCell` entries (tagged `critiqued: boolean`) that flow into shuffling and blinding
exactly like any other cell. This is deliberate: a reviewer comparing two *visibly paired* samples
side-by-side would anchor on "which one sounds more edited" rather than scoring each on its own
merits per the existing rubric — independent blinding preserves the rubric's validity. The
JSON label map (never shown to the reviewer) still records which cells are before/after pairs, so
the aggregate AI-tell-absence delta can be computed after scores come in.

### 7. Config shape

`config/index.ts`: `content_generation.critique_enabled: env.CONTENT_CRITIQUE_ENABLED === 'true'`
(schema default `'false'`), `content_generation.critique_formats: FormatId[]` parsed from a
comma-separated `CONTENT_CRITIQUE_FORMATS` (schema default `'facebook_post,linkedin_post'`),
following the exact pattern already used for `NEWS_CONTENT_FETCH_ENABLED` and
`NEWS_INGESTION_RSS_FEEDS`'s comma-split parsing respectively — no new parsing convention introduced.

## Risks / Trade-offs

- **[Risk] Doubles latency and token cost for every critiqued format when enabled.** → Mitigation:
  off by default; format-scoped even when on; the whole reason `--critique both` exists is to
  measure whether the quality gain justifies this cost before anyone flips the default.
- **[Risk] A second model call is a second chance to fail/rate-limit**, which could make an
  otherwise-successful generation slower or (if not soft-failed correctly) fail outright. →
  Mitigation: soft-fail is the explicit design (Decision 4/5) — a critique failure never surfaces to
  the caller; worst case, the user gets the same-quality first-pass output they'd have gotten with
  the flag off, just after a wasted extra call.
- **[Trade-off] The critique pass cannot fix a first-pass draft that's fundamentally off-topic or
  factually wrong** — it only touches phrasing per Decision 2's contract. → Accepted: that's a
  first-pass grounding problem (facts-then-write, already shipped), not this change's job to solve.
- **[Trade-off] Guards are heuristic, not perfect** (e.g. the length-band and script-ratio checks can
  both false-negative on an edge case). → Accepted: cheap and directionally correct beats an
  expensive third LLM call to judge the second one; the real backstop is that the whole feature stays
  off by default until paired evidence justifies it.

## Migration Plan

No data migration. Two new optional env vars with safe defaults (`CONTENT_CRITIQUE_ENABLED=false`
means zero behavior change for every existing deployment that doesn't set it). Rollback is a
one-line env change (or simply never setting it) — no code revert needed even after enabling, since
the flag gates the entire code path.

## Open Questions

- Whether to enable by default, and for which formats/packs, is explicitly deferred to
  `BANGLA-QUALITY-DECISION.md` once `--critique both` evidence exists — not resolved by this change,
  by design (see proposal.md's Why and this doc's Non-Goals).
