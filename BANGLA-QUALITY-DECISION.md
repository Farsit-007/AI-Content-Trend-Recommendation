# Bangla Content Quality — Decision Record

**Status:** Template + process defined. No real bake-off has run yet — see "Gate G3" below.
**Tooling:** `npm run verify:bangla-bakeoff` (`backend/src/scripts/banglaBakeoff.ts`), core logic in
`backend/src/app/modules/ContentGeneration/contentGeneration.bakeoff.ts`.
**Parent context:** [9-VISION-V7-V9-WRITER-STYLE-QUALITY-OPENSPEC-PLAN.md](./9-VISION-V7-V9-WRITER-STYLE-QUALITY-OPENSPEC-PLAN.md)
Track 0 (real writer corpus) and Gate G3 (this document's actual decision). Originally flagged as
"⚠️ the critical step" and left unresolved in [RAG-BANGLA-PLAN.md](./RAG-BANGLA-PLAN.md) §1.4.

---

## Why this document exists

`RAG-BANGLA-PLAN.md` deferred a real decision on Bangla model quality in favor of shipping the
free-tier default for the hackathon demo. That deferral was reasonable at the time, but it means
nobody has ever actually judged whether the current free model (`nvidia/nemotron-3-ultra-550b-a55b:free`)
writes Bangla well enough to meet the vision's own bar: *"should not feel like ai generated…
Bangladeshi tech writers would have written."* This document is where that judgment gets made,
recorded, and kept up to date as models and corpora change.

## The rubric

Every sample in a bake-off review is scored on these four dimensions plus a forced binary call.
Anchors are deliberately concrete — a reviewer should be able to point at a specific sentence to
justify a low score, not just go with a gut feeling.

| Dimension | 5 (best) | 3 (mixed) | 1 (worst) |
|---|---|---|---|
| **Bangla correctness** | No conjunct (যুক্তবর্ণ) or grammar errors a native reader trips on; natural sentence flow | A couple of minor awkward phrasings, still fully readable | Broken grammar, wrong conjuncts, or unintended English drift throughout |
| **Style fidelity** | Reads like it belongs in the selected pack's corpus — tone, rhythm, emoji use, hook style all match | Roughly the right register but generic in places | Could be any style — no discernible match to the pack |
| **AI-tell absence** | You cannot point at a specific sentence and say "that's a bot" — no formulaic openers/closers, varied sentence length | One or two AI-flavored phrases, otherwise fine | Reads as obviously AI-generated: formulaic structure, generic marketing voice, repetitive rhythm |
| **Factual grounding** | Every specific claim traces back to the provided context/facts; general topics stay appropriately general | Mostly grounded, one minor unsupported specific | Invents numbers, quotes, features, or dates not present in the source |
| **Publish with ≤2 edits?** | — | — | Forced yes/no. This is the vision's own bar: "just click, tweak, copy paste with no extra efforts." |

**Diagnostic rule** (carried over from `RAG-BANGLA-PLAN.md` §1.4, still the right heuristic): wrong
tone → fix/expand the pack's examples; broken Bangla → the model is the problem; English creeping
back in → strengthen the language instruction in the prompt. A low score doesn't automatically mean
"switch models" — check which of the three it actually is before concluding that.

## Review process

1. Run `npm run verify:bangla-bakeoff -- --models <candidates> --pack <a-real-Track-0-pack> [...]`.
   This produces a JSON (`bakeoff-results/bakeoff-<timestamp>.json`, gitignored, keep it privately —
   it reveals model identity) and a blinded Markdown review (`...-review.md`).
2. Hand **only the review Markdown** to at least one native Bangla speaker familiar with the target
   writer style (e.g. someone who actually reads Programming Hero's content). Never show them the
   JSON before they finish scoring.
3. Reviewer fills in the rubric table for every sample.
4. **With 2+ reviewers:** average the four numeric scores per sample; the "publish" call requires a
   majority yes. Large disagreements (≥2 points apart on any dimension) get a third reviewer as a
   tie-break rather than being averaged away silently.
5. Reveal the label map (the JSON file) only after scoring is complete. Aggregate scores per
   *model* (not per sample) across all its cells.
6. Apply the decision rule below and record the outcome in the table at the bottom of this file.

## Decision rule

- If the best-performing free-tier model's **"publish with ≤2 edits" rate ≥ 60%** and its **Bangla
  correctness averages ≥ 4** across the run → **keep free tier**, set `LLM_MODEL_CONTENT` (and
  `LLM_MODEL_STANDARD` if it shares the same quality bar) to that model, record the outcome.
- Otherwise → the record should name the best-scoring candidate regardless of tier and note whether
  it's free or paid. Moving to a paid model is a one-line `.env` change
  (`LLM_MODEL_CONTENT=<model-id>`) — generation volume is low (interactive requests + ≤10 auto-drafts/day
  per `AUTO_GENERATION_MAX_PER_RUN`), so the cost impact of a paid mid-tier model is expected to be
  small; this document should still state the expected $/month order of magnitude once a real run
  informs it.
- If AI-tell absence scores poorly while every other dimension scores well → this is the trigger
  condition for proposing `style-fidelity-critique-pass` (the plan's change 9D), not a reason to
  change models.

## Gate G3 status

**Not yet run.** Running this for real requires a Track-0 writer corpus (≥30 real examples in a
launch style pack — see the parent plan) so the bake-off measures real style-pack fidelity, not a
handful of scratch/test examples. This document's rubric, tooling, and process are ready; the
decision-record table below is intentionally empty until a real run happens.

## Decision record

| Date | Chosen model (`LLM_MODEL_CONTENT`) | Pack(s) tested | Bangla correctness (avg) | Style fidelity (avg) | AI-tell absence (avg) | Publish ≤2 edits rate | Free/paid | Notes |
|---|---|---|---|---|---|---|---|---|
| _(none yet — Gate G3 pending Track 0)_ | | | | | | | | |
