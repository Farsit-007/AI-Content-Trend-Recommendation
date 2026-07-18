## Why

`RAG-BANGLA-PLAN.md` §1.4 flagged the Bangla model-fluency check as "⚠️ the critical step" before
trusting any generated Bangla content — and it has never run. Every LLM role
(`LLM_MODEL_STANDARD`/`CONTENT`/`FALLBACK`) in `backend/.env` currently points at the same free
model (`nvidia/nemotron-3-ultra-550b-a55b:free`), which also silently disables the failover
`chatCompletion` already supports (confirmed live: `llmClient.ts` logs a boot warning about exactly
this). With `style-corpus-intake-at-scale` and `style-platform-aware-retrieval` now shipped, the
platform has everything needed to *measure* generation quality against a real writer corpus — but
no repeatable, bias-controlled way to actually do that measurement exists. Without it, "does this
sound AI-generated" stays a gut call made once, informally, rather than an evidence-based, re-runnable
decision.

## What Changes

- Extract a small, already-implicit piece of `ContentGeneration`'s prompt-assembly logic into a
  named, exported, pure helper (`buildStyleContext`) so both the production service and a new
  offline harness build style-conditioned prompts through the exact same code — not a
  reimplementation that can silently drift from what real requests actually send. `generateContent`'s
  behavior is unchanged (regression-tested); this is a refactor, not a feature change.
- Add a new offline script, `npm run verify:bangla-bakeoff`, that drives the real prompt-assembly
  path (style pack resolution, style example retrieval, facts-then-write grounding, per-format
  instructions) across a configurable matrix of candidate models × topics × formats, with the model
  id as the only thing that varies from production. Output: a machine-readable JSON of every
  generation (model, prompt, params, output, latency, errors) and a **blinded, shuffled** Markdown
  review document with a fixed scoring rubric, so a native-speaker reviewer judges output quality
  without knowing which model produced which sample.
- Ship a default topic set (`backend/seed/bakeoff-topics.json`, 6 topics spanning the news
  taxonomy) and cap the matrix (≤4 models × ≤8 topics × ≤2 formats) to keep a single run bounded
  and free-tier-rate-limit-tolerant (serial execution, per-cell failure capture, never aborts the run).
- Fix `backend/.env`'s LLM role configuration so `LLM_MODEL_FALLBACK` genuinely differs from
  `LLM_MODEL_CONTENT`/`LLM_MODEL_STANDARD` (`.env.example` already documents this requirement
  correctly; the live `.env` currently violates it).
- Add `docs/BANGLA-QUALITY-DECISION.md` (repo root, alongside the existing planning docs) — a
  template plus, once a real bake-off runs, the recorded outcome: chosen model, scores, and the
  free-vs-paid tier decision. This document's existence (with the template filled in after a real
  run) is this change's actual deliverable, not just the script.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `content-generation`: adds an offline, non-serving-path bake-off harness capability alongside the
  existing generation requirements. No change to `POST /content/generate`'s request/response
  contract or runtime behavior.

## Impact

- **Backend:** `backend/src/app/modules/ContentGeneration/contentGeneration.retrieval.ts` (new
  `buildStyleContext` export), `contentGeneration.service.ts` (refactored to call it — no behavior
  change), new `contentGeneration.bakeoff.ts` (matrix runner, shuffling, output formatting), new
  `backend/src/scripts/banglaBakeoff.ts` (CLI wrapper), new `backend/seed/bakeoff-topics.json`,
  `.env`/`.env.example` (env fix), `backend/.gitignore` (new `bakeoff-results/` output directory).
- **Docs:** new `docs/BANGLA-QUALITY-DECISION.md` at the repo root.
- **Tests:** unit tests for `buildStyleContext`, the shuffle/blinding logic, and matrix-cap/error-
  capture behavior; a prompt-parity regression test confirming the harness and the live service
  build identical prompts for equivalent inputs; full existing `contentGeneration.*` suite must pass
  unchanged (proves the extraction didn't alter serving behavior).
- **No breaking changes** — this is additive tooling plus one internal refactor with no observable
  behavior change to any existing endpoint, and an env-file correctness fix.
