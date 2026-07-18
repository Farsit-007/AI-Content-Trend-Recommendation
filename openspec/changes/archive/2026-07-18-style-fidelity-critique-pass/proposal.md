## Why

The vision's bar for Bangla output is explicit: it should read like a real Bangladeshi tech writer
wrote it, not like an LLM. `bangla-quality-bakeoff-harness` shipped the tooling to measure this
(blinded, model-vs-model comparison against a real style pack) but running it for real against a
real writer corpus — Gate G3 in the parent plan — hasn't happened yet; `BANGLA-QUALITY-DECISION.md`'s
decision table is still empty. This change is being proposed ahead of that evidence, at the user's
explicit request, rather than after a recorded "close but AI-ish" verdict as the parent plan
originally intended. Given that, it ships as an **off-by-default, evidence-gated capability**: the
mechanism exists and is fully tested, but nothing about default generation behavior changes until
someone runs the bake-off harness's `--critique both` comparison mode (also added here) and decides,
with real before/after evidence, that it's worth turning on.

## What Changes

- Add an optional second-pass "critique and rewrite" step to text-format content generation: when
  enabled and a style pack is active, after a text format's first draft is generated, a second model
  call receives the draft plus the pack's style card and rewrites only the sentences that read as
  AI-generated (formulaic openers/closers, uniform rhythm, generic abstraction) — preserving facts,
  language, length band, and structure. Disabled by default
  (`CONTENT_CRITIQUE_ENABLED=false`), and even when enabled, scoped to a configurable subset of
  formats (`CONTENT_CRITIQUE_FORMATS`, default `facebook_post,linkedin_post`).
- The pass is skipped for `youtube_idea` (JSON-kind, not prose), for generations with no resolved
  style pack (nothing for the critique to check fidelity against), and for `/content/refine` (the
  user is already hand-steering that text; a second automatic pass would fight their instruction).
- Soft-fail by design: any critique-call error, or an output that fails a cheap sanity check
  (empty, drastically different length, or a large shift in Bangla-script character ratio suggesting
  language drift), discards the critique output and keeps the first-pass draft — never a request
  failure, and the discard is logged.
- The pass runs before caching, so a cache hit never re-runs it and the cached value is always the
  final (possibly critiqued) text.
- Extend the bake-off harness (`bangla-quality-bakeoff-harness`) with a `--critique both` mode that
  generates each matrix cell twice — with and without the critique pass — as independently blinded
  samples, so the enable-by-default decision is made from paired evidence rather than assumption.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `content-generation`: adds an optional critique-and-rewrite step to the existing generation
  requirement, and extends the bake-off harness requirement with paired critique-comparison mode.
  No change to `POST /content/generate`'s request/response shape; the flag is server-side
  configuration, not a per-request parameter (a per-request override is deliberately out of scope —
  see design.md).

## Impact

- **Backend:** new `backend/src/app/modules/ContentGeneration/contentGeneration.critique.ts`
  (critique prompt + guards + soft-fail wrapper), `contentGeneration.service.ts` (wiring, miss-path
  only), `contentGeneration.formats.ts` or `contentGeneration.critique.ts` (default critique-eligible
  format list), `backend/src/app/config/index.ts` + `.env.example` (two new config vars),
  `contentGeneration.bakeoff.ts` + `scripts/banglaBakeoff.ts` (`--critique both` mode).
- **Docs:** `BANGLA-QUALITY-DECISION.md` gains a section recording the eventual enable/disable
  decision once paired evidence exists.
- **Tests:** flag-off byte-identical behavior (zero extra LLM calls), guard unit tests, cache
  correctness (critiqued text is what's cached; a cache hit makes no critique call), scope
  exemptions (`youtube_idea`, no-pack, refine).
- **No breaking changes.** Default behavior is unchanged (flag defaults false); when explicitly
  enabled, the only observable change is text quality for the configured formats — no shape change
  to any request or response.
