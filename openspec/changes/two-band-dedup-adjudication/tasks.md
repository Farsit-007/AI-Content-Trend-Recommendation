## 1. Config

- [ ] 1.1 envSchema: `NEWS_INGESTION_HARD_DUP_THRESHOLD` default `'0.9443'` (D1's measured ceiling), `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES` default `'5'`; export under `news_ingestion`; `superRefine`: ceiling > `semantic_dedup_threshold`, both in (0,1]; document both in `backend/.env.example` (mark the ceiling "calibrated — re-run the D1 harness before changing")

## 2. Pool + router

- [ ] 2.1 Widen `fetchRecentEmbeddings` to return `RecentPoolEntry[]` (`{ _id, embedding, title, snippet, published_at, story_id?, story_seq? }`); update both call sites (`newsIngestion.service.ts`, `verifySemanticDedupLive.ts`)
- [ ] 2.2 Rework `dedupeSemantic` into a pure band-router: sort candidates by `published_at` asc (missing last); for each, find the best (highest-similarity) match across recent pool ∪ accepted-in-run; return `{ accepted, hardDuplicates: [{candidate, match}], grayPairs: [{candidate, match}] }`; in-run pairs ≥ ceiling resolved by `engagementWeight` with the loser attached for absorption. Export the return types.

## 3. Adjudicator

- [ ] 3.1 New `newsIngestion.adjudicate.ts`: `adjudicatePairs(pairs)` — batches of 10, `LLM_MODELS.standard`, `temperature 0.3`, `ADJUDICATION_SYSTEM_PROMPT` imported from `scripts/dedupCalibrationPairs.ts`, A/B ordering by `published_at`; parse/validate per `categorize.ts` discipline; per-batch and per-item fallback → `{ verdict: 'update', confidence: 0, fallback: true }`; enforce the batch cap with fallback for overflow; demote an `update` verdict on an older-than-match candidate to `distinct` (design decision 3)

## 4. Schema + orchestration

- [ ] 4.1 `corroborations` on `newsItem.model.ts` / `newsItem.interface.ts` (subdoc array `{ source, points, comments, url, at }`, `$slice: -10` applied on push in the update operator, not the schema)
- [ ] 4.2 Service Layer 2b orchestration: route → adjudicate → apply verdicts; corroborate stored matches (bulk update: `$push` corroborations + `engagement_history` snapshot, `$set current_trend_score` via `computeCurrentTrendScore` with corroboration-augmented engagement); in-run matches absorbed in memory before insert; `needs_review` propagation into the payload build; `dedupedCounts` counts the final survivors
- [ ] 4.3 `IngestionRun` interface + model: optional `adjudication` subdoc `{ gray_pairs, batches, verdict_duplicate, verdict_update, verdict_distinct, fallbacks }`; plumb through `persistRun`
- [ ] 4.4 Adapt `verifySemanticDedupLive.ts` default mode to the new `dedupeSemantic` return shape (paraphrase → hardDuplicate or `duplicate` verdict; distinct survives)

## 5. Verification (live — no unit/integration test authoring per skip-test)

- [ ] 5.1 `cd backend && npm run build` passes; server boots with neither new var set; existing `npm test` suite stays green (no new tests authored)
- [ ] 5.2 Live: `npm run verify:semantic-dedup-live` default mode passes (the 0.8986-class cross-source pair still collapses — now recorded as corroboration)
- [ ] 5.3 Live: ingest twice; run history shows the `adjudication` block; gray pairs ≤ cap; no run-duration blowup
- [ ] 5.4 LLM outage drill (point `LLM_MODEL_STANDARD` + `LLM_MODEL_FALLBACK` at an invalid model in a dev env): gray candidates stored with `needs_review: true`, none lost, `fallbacks` counter equals the pair count

## Notes

- The verdict guard (design 3): an older-than-match candidate judged `update` is treated as `distinct` — easy to forget, silently builds backwards chains in D3.
- Never store the adjudicator's `note` on the item in this change (that's D3's `update_note`).
- `$slice` on corroborations goes in the update operator, not the schema.
- Test-authoring intentionally skipped by standing request; live verification (§5) is retained because it produces the acceptance evidence for the reported bug fix.
