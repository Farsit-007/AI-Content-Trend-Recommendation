## 1. Fixtures + prompt

- [x] 1.1 Create `backend/src/scripts/dedupCalibrationPairs.ts` exporting `CALIBRATION_PAIRS: { a: { title: string; snippet: string }; b: { title: string; snippet: string }; label: 'duplicate' | 'update' | 'distinct'; klass: string }[]` — ~35 hand-written pairs (~10 true duplicates: paraphrase / cross-post / syndication; ~15 progressive updates: status reversal, version release, metric update, follow-up analysis; ~10 same-topic-distinct), anchored on the reported "Fable" scenario plus real-world-shaped tech news
- [x] 1.2 In the same file, export `ADJUDICATION_SYSTEM_PROMPT` verbatim from design decision 2 (final form — this exact prompt is imported by D2's adjudicator)

## 2. Harness — calibrate mode

- [x] 2.1 Extend `backend/src/scripts/verifySemanticDedupLive.ts` with a `--calibrate` mode: embed every pair with the real embedding model, print a per-class cosine-similarity distribution table (min / median / max for duplicate, update, distinct)
- [x] 2.2 In `--calibrate`, propose the ceiling as `max(update-class cosine) + 0.005` and print it; flag any update pair scoring above every duplicate pair as a future few-shot candidate (do not raise the ceiling to cover it)

## 3. Harness — judge mode

- [x] 3.1 Add a `--judge` mode: for pairs whose similarity ≥ the semantic threshold (gray band), run them through `chatCompletion` in batches of 10 with `ADJUDICATION_SYSTEM_PROMPT`, `temperature 0.3`, `LLM_MODELS.standard`, older/newer (A/B) ordering by published date; parse strict JSON with fence-stripping per `categorizeBatch` discipline
- [x] 3.2 In `--judge`, print a confusion matrix over the gray-band pairs and pass/fail against the asymmetric bars (≥ 90 % duplicates, ≥ 95 % updates); exit nonzero on bar failure

## 4. Default mode + wiring

- [x] 4.1 Keep the existing default mode intact (the original three-item regression: cross-source duplicate collapse at ~0.8992, engagement tie-break, distinct survival still runs and passes)
- [x] 4.2 (Optional) add a `verify:dedup-calibrate` alias to `backend/package.json` (also added `verify:dedup-judge`)

## 5. Run + record (gates D2)

- [x] 5.1 `cd backend && npm run build` passes (exit 0; `npm install` restored the missing `@extractus/article-extractor` dep, a pre-existing env gap). Live default mode passes: 0.8986 cross-source dup collapses (≈ the documented 0.8992 class), higher-engagement kept, distinct (0.1397) survives.
- [x] 5.2 Ran `--calibrate` live. Proposed ceiling **0.9443** (= max update 0.9393 + 0.005; above the 0.88 floor). Per-class table + few-shot flag recorded in `calibration-results.md`. Note: an initial fixture revision was needed — realistic reworded updates embed below the floor, so the update pairs were tightened to near-identical-surface (the reported failure mode) to populate the gray band.
- [x] 5.3 Ran `--judge` live. Gray band (≥0.88) = 11/35; confusion matrix perfect (dup 7/7 = 100%, update 4/4 = 100%) — both bars PASS with `LLM_MODELS.standard`, no few-shot / two-tier escalation needed. Full matrix in `calibration-results.md`. (First attempt hit a transient transport error on a single-item batch, scored as a miss not a silent pass — validates D2's no-silent-loss rule.)

## Notes

- Do NOT insert calibration items into `news_items` — the harness works in memory against the real recent pool.
- Do NOT tune the `0.88` threshold in this change — this change proposes numbers; D2 applies them.
- Per-item unit tests are intentionally omitted (test-writing skipped by request); the committed pair set itself becomes D2's shared test fixture.
