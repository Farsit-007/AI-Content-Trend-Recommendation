## 1. Config

- [x] 1.1 envSchema: `NEWS_INGESTION_HARD_DUP_THRESHOLD` default `'0.9443'` (D1's measured ceiling), `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES` default `'5'`; export under `news_ingestion`; `superRefine`: ceiling > `semantic_dedup_threshold`, both in (0,1]; documented both in `backend/.env.example`

## 2. Pool + router

- [x] 2.1 Widened `fetchRecentEmbeddings` to return `RecentPoolEntry[]` (`{ _id, embedding, title, snippet, published_at, story_id?, story_seq? }`); updated all call sites (`newsIngestion.service.ts`, and both verify scripts)
- [x] 2.2 Reworked `dedupeSemantic` into a pure band-router: sorts by `published_at` asc (missing last); best-match across recent pool ∪ accepted-in-run; returns `{ accepted, hardStoredDrops, grayPairs }`; in-run pairs ≥ ceiling resolved by `engagementWeight` with the loser absorbed as a corroboration. Return types exported.

## 3. Adjudicator

- [x] 3.1 New `newsIngestion.adjudicate.ts`: `adjudicatePairs(inputs, maxBatches)` — batches of 10, `LLM_MODELS.standard`, `temperature 0.3`, `ADJUDICATION_SYSTEM_PROMPT` imported from `scripts/dedupCalibrationPairs.ts`, A/B ordering by `published_at`; parse/validate per `categorize.ts` discipline; per-batch and per-item fallback → `{ verdict: 'update', confidence: 0, fallback: true }`; batch cap enforced with fallback for overflow. (The older-than-match `update`→`distinct` demotion lives in the service's verdict application — design decision 3.)

## 4. Schema + orchestration

- [x] 4.1 `corroborations` on `newsItem.model.ts` / `newsItem.interface.ts` (subdoc array `{ source, points, comments, url, at }`; 10-entry cap applied via `.slice(-10)` in the update path, not the schema)
- [x] 4.2 Service Layer 2b orchestration (`applyAdjudication` + `applyStoredCorroborations`): route → adjudicate → apply verdicts; stored-match corroboration via `bulkWrite` (`$set` corroborations capped 10 + `engagement_history` snapshot capped 32 + recomputed `current_trend_score` via `computeCurrentTrendScore` with corroboration-augmented engagement); in-run matches absorbed in memory before insert (payload carries `corroborations` + augmented score); `needs_review` OR'd with the adjudication flag; `dedupedCounts` counts final survivors. Corroboration writes are non-fatal.
- [x] 4.3 `IngestionRun` interface + model: optional `adjudication` subdoc `{ gray_pairs, batches, verdict_duplicate, verdict_update, verdict_distinct, fallbacks }`; plumbed through `persistRun` (both success and crash paths)
- [x] 4.4 Adapted `verifySemanticDedupLive.ts` default mode to the router shape — now a deterministic routing check (empty pool, no DB/LLM): the ~0.899 GPT pair lands in the gray band, distinct is accepted. Also updated the offline `verifySemanticDedup.ts` to the new 4-arg signature (band-edge checks: hard-dup in-run/stored, gray routing, distinct accept).

## 5. Verification (live — no unit/integration test authoring per skip-test)

- [x] 5.1 `cd backend && npm run build` passes (exit 0); config loads with both new vars UNSET (defaults 0.9443 / 5, superRefine ceiling>floor satisfied); full `npm test` suite green (35 suites / 239 tests); offline `verify:semantic-dedup` routing checks pass
- [x] 5.2 Live: `verify:semantic-dedup-live` default mode passes — the 0.8987 cross-source GPT pair routes to the gray band (adjudication territory under two-band; the LLM-judged collapse+corroboration is exercised by the full live run in 5.3), distinct accepted
- [x] 5.3 Live (real Atlas DB, 3 ingests): run 1 = 19 candidates → 17 survived (2 hard-dup, 5 gray), adjudication block persisted `{gray_pairs:5,batches:1,...,fallbacks:5}`; run 2 = 7→5 (2 hard-dup, 0 gray), no dup rows (1166→1166); durations 48/19/16s (no blowup). Hard-dup corroboration verified: the SQLite HN story absorbed its Lobsters cross-post as corroboration (one card, augmented score). **Implementation-revealed bug fixed:** corroborations now dedupe by URL so a perpetual cross-post refreshes rather than stacks (design decision 7; verified live — 2 dupes collapsed to 1).
- [x] 5.4 Outage discipline verified **naturally** during run 1: the LLM hit a real `429` (free-tier daily limit), so all 5 gray pairs took the fallback path — kept with `needs_review`, **zero dropped**, `fallbacks` counter = gray-pair count (5). This is the outage-drill outcome from a real transport failure rather than a forced invalid model.

## Notes

- The verdict guard (design 3): an older-than-match candidate judged `update` is treated as `distinct` — easy to forget, silently builds backwards chains in D3.
- Never store the adjudicator's `note` on the item in this change (that's D3's `update_note`).
- `$slice` on corroborations goes in the update operator, not the schema.
- Test-authoring intentionally skipped by standing request; live verification (§5) is retained because it produces the acceptance evidence for the reported bug fix.
