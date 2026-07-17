## Why

The `0.88` semantic-dedup threshold was calibrated once with three hand-written items and proved only that the duplicate band starts at ~0.899. The upcoming two-band dedup design (change D2) needs two more empirically-set facts before any pipeline change can ship: the **hard-duplicate ceiling** (proposed 0.97, the point above which items are dropped with no LLM call) and **evidence that a cheap LLM can adjudicate the gray band accurately**. Guessing either value reintroduces the original sin — the un-verified `0.93` guess that silently dropped real news. This change produces those numbers as gated tooling; it changes zero pipeline behavior.

## What Changes

- **Labeled pair set (committed fixture).** Add `backend/src/scripts/dedupCalibrationPairs.ts` exporting ~35 hand-written pairs — ~10 true duplicates (paraphrase / cross-post / syndication), ~15 progressive updates covering the reported classes (status reversal "released→banned", version release, metric update, follow-up analysis), ~10 same-topic-distinct pairs — plus the final-form adjudication system prompt (`ADJUDICATION_SYSTEM_PROMPT`). D2's adjudicator and unit tests import the same fixtures so the prompt is measured before it ships and regression-tested after.
- **`--calibrate` mode** on the existing `verifySemanticDedupLive.ts` script: embeds all pairs with the real embedding model, prints per-class cosine-similarity distributions (min/median/max), and proposes `HARD_DUP = max(update-class similarity) + 0.005` margin. Any *update* pair scoring above every *duplicate* pair is flagged as a future few-shot candidate rather than forcing the ceiling up.
- **`--judge` mode:** runs the adjudication prompt over all gray-band pairs with `LLM_MODELS.standard` and prints a confusion matrix. Acceptance bar (asymmetric by design): ≥ 90 % correct on duplicates, ≥ 95 % correct on updates — a false "duplicate" is lost news, the expensive error.
- **Default mode preserved:** the original three-item regression (cross-source duplicate collapse at ~0.8992, engagement tie-break, distinct survival) still runs and passes, so prior guarantees remain re-checkable.
- **Optional `verify:dedup-calibrate` npm alias.**
- Results are recorded as console output to be pasted into the D2 proposal; the pair set doubles as the permanent regression suite for any later prompt/model/embedding change.

No app-module changes, no config, no schema. The script hits real money APIs (embeddings + LLM) and is run manually, not wired into CI.

## Capabilities

### New Capabilities
- `dedup-adjudication`: the calibration-tooling requirement — a live harness with a committed, hand-labeled pair set that measures per-class embedding-similarity distributions, proposes the hard-duplicate ceiling from the update class, and measures adjudication-prompt accuracy per class. (Pipeline requirements under this same capability arrive in D2; this change adds only the tooling requirement.)

### Modified Capabilities
<!-- None. openspec/specs/ is empty; no existing capability's requirements change. -->

## Impact

- **Extend:** `backend/src/scripts/verifySemanticDedupLive.ts` (add `--calibrate` and `--judge` modes; keep default mode intact) — runs today via `npm run verify:semantic-dedup-live`.
- **New:** `backend/src/scripts/dedupCalibrationPairs.ts` (fixtures + shared prompt text).
- **Optionally:** `backend/package.json` (`verify:dedup-calibrate` alias).
- **Runtime dependencies:** `OPENROUTER_API_KEY` + a reachable DB to run live (the real embedding model and `chatCompletion`, which already fails over to `LLM_MODELS.fallback`).
- **No** changes to any pipeline module, config schema, or Mongoose model. Output gates change D2 (its `NEWS_INGESTION_HARD_DUP_THRESHOLD` default is set to the measured ceiling; its adjudicator either passes the judge bars or records the few-shot / two-tier contingency).
