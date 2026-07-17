## Why

`dedupeSemantic` unconditionally drops any candidate ≥ 0.88 cosine-similar to a recently stored item (`newsIngestion.utils.ts:96`). D1's calibration proved true duplicates and material updates overlap in the 0.88–0.9443 band — no scalar threshold separates "same information" from "same topic, new information" (the reported bug: "Fable released" → "Fable banned" → "Fable public again" die at dedup). Distinguishing them requires reading the content: a batched LLM adjudication for the gray band only, with hard duplicates (≥ ceiling) still dropped without an LLM call, and every dropped duplicate's engagement absorbed as corroboration instead of evaporating. **This change alone fixes the reported bug** — updates get stored instead of silently dropped. Chains (D3) make them presentable.

## What Changes

- **Wider recent pool:** `fetchRecentEmbeddings` returns `{ _id, embedding, title, snippet, published_at, story_id?, story_seq? }[]` instead of bare `number[][]` (same single query, wider projection; story fields projected now so D3 doesn't touch this again). All call sites updated (`newsIngestion.service.ts`, `verifySemanticDedupLive.ts`).
- **`dedupeSemantic` reworked into a pure band-router:** sorts candidates by `published_at` ascending (missing dates last), finds each candidate's *best* (highest-similarity) match across recent pool ∪ accepted-in-run, and returns `{ accepted, hardDuplicates, grayPairs }`. `< floor (0.88)` → accepted (today's behavior); `≥ ceiling (NEWS_INGESTION_HARD_DUP_THRESHOLD, default 0.9443)` → hardDuplicates (no LLM); in between → grayPairs. The old in-run higher-engagement tie-break is subsumed: an in-run pair ≥ ceiling keeps the higher-`engagementWeight` copy and the loser becomes a corroboration on it.
- **New adjudicator `newsIngestion.adjudicate.ts`:** batches of 10 gray pairs, `LLM_MODELS.standard`, `temperature 0.3`, the shared `ADJUDICATION_SYSTEM_PROMPT` from D1, pair ordering by `published_at` (A = older). Verdicts: `duplicate` → drop candidate + corroborate the match; `update` → store candidate (carry `note` + `confidence`); `distinct` → store normally. **Failure discipline (no-silent-loss):** call failure, unparseable JSON, missing id, invalid verdict, or exceeding the per-run batch cap (`NEWS_INGESTION_ADJUDICATION_MAX_BATCHES`, default 5) → verdict `update` with `confidence: 0` → keep + `needs_review: true`. Real verdicts with `confidence < 0.5` are honored but also set `needs_review: true`.
- **Corroborations:** new schema field `corroborations: [{ source, points, comments, url, at }]` capped at 10 (`$slice`). On every hard-dup drop and `duplicate` verdict whose match is a *stored* item: push the candidate's engagement evidence, push an `engagement_history` snapshot reflecting corroboration-augmented totals, and recompute the match's `current_trend_score` via R2's exported `computeCurrentTrendScore` with corroboration-augmented engagement. For *in-run* matches, absorb in memory before insert.
- **Run-history counters (run-level, additive):** `IIngestionRun` gains `adjudication?: { gray_pairs, batches, verdict_duplicate, verdict_update, verdict_distinct, fallbacks }`.
- **Config:** `NEWS_INGESTION_HARD_DUP_THRESHOLD` (default `0.9443`, D1's measured ceiling), `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES` (default `5`); `superRefine`: ceiling > semantic threshold, both in (0,1].

## Capabilities

### New Capabilities
<!-- None net-new; the dedup-adjudication capability was introduced by D1 (calibration tooling). D2 adds this capability's pipeline requirements. openspec/specs/ is empty (no change has been synced), so the delta is written as full restated ADDED requirements per the plan's spec-delta convention. -->

### Modified Capabilities
- `dedup-adjudication`: adds the two-band pipeline requirements (band routing, gray-band adjudication, no-silent-loss failure discipline, corroboration absorption, adjudication observability) on top of D1's calibration-tooling requirement.
- `news-ingestion`: Layer 2b (semantic dedup) behavior restated to reference the two-band router + adjudication instead of the unconditional ≥ 0.88 drop.

## Impact

- `newsIngestion.utils.ts` — `fetchRecentEmbeddings` projection widened; `dedupeSemantic` reworked into a pure band-router (types exported for reuse).
- **New** `newsIngestion.adjudicate.ts` — imports `ADJUDICATION_SYSTEM_PROMPT` from `scripts/dedupCalibrationPairs.ts`.
- `newsIngestion.service.ts` — Layer 2b orchestration: band-route → adjudicate → apply verdicts → corroborate; `dedupedCounts` counts final survivors (layer-count math unchanged); persistRun carries the adjudication block.
- `newsItem.model.ts` / `newsItem.interface.ts` — `corroborations` subdoc array.
- `IngestionRun/ingestionRun.interface.ts` + `ingestionRun.model.ts` — optional `adjudication` subdoc.
- `config/index.ts` + `backend/.env.example` — the two new vars.
- `verifySemanticDedupLive.ts` — adapt default mode to the new `dedupeSemantic` return shape.
- Reuses R2's `computeCurrentTrendScore` (pure) and R1's `engagement_history`; no changes to those.
