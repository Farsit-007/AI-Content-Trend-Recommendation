# Calibration results — dedup-calibration-harness

Live run 2026-07-18 against the configured embedding model + `LLM_MODELS.standard`
(35 committed pairs in `backend/src/scripts/dedupCalibrationPairs.ts`; semantic floor `0.88`).
**Paste this whole file into the D2 (`two-band-dedup-adjudication`) proposal — it is the gate.**

## Headline numbers (for D2)

- **`NEWS_INGESTION_HARD_DUP_THRESHOLD` = `0.9443`** — proposed ceiling = `max(update-class cosine) + 0.005`.
  Sits above the `0.88` floor, so the gray band `[0.88, 0.9443)` is non-empty and D2's
  `superRefine` (ceiling > floor) holds. (Close to the deep-dive's ≈0.97 expectation; the pair
  set is the authority, not the guess.)
- **Judge (`LLM_MODELS.standard`) clears both bars unaided — no few-shot / two-tier escalation.**
  Duplicate 100% (bar 90%) · Update 100% (bar 95%).

## `--calibrate` — per-class cosine distribution

```
class      n    min      median   max
duplicate  10   0.8347   0.9010   0.9343
update     15   0.6409   0.8328   0.9393
distinct   10   0.3581   0.4192   0.6479

Max update-class similarity: 0.9393
Proposed HARD_DUP ceiling = 0.9393 + 0.005 = 0.9443
```

Few-shot flag (1 update out-scores every duplicate — do NOT raise the ceiling to cover it):
- `[0.9393]` (status-reversal) "Framework X will keep CommonJS support in its next major version"
  — a near-verbatim edit of its predecessor with the meaning flipped. This is the poster child
  for why the LLM judge exists: no scalar threshold separates it from a true duplicate. The judge
  classified it correctly, so it stays a documented hard case, not a prompt change.

## `--judge` — confusion matrix (gray band, ≥ 0.88: 11 of 35 pairs)

```
actual\pred   duplicate    update  distinct     error
duplicate           7         0         0         0
update              0         4         0         0
distinct            0         0         0         0

duplicate correct: 100.0%  (bar 90%): PASS
update correct:    100.0%  (bar 95%): PASS
```

## `--default` — legacy regression (unchanged, still passing)

```
Cosine — GPT-5.5 (HN) vs GPT-5.5 (Dev.to):  0.8986   (the documented ~0.8992 cross-source class)
Cosine — GPT-5.5 (HN) vs dotfiles (unrelated): 0.1397
[5.1] Near-duplicate pair collapsed to one: PASS
      Higher-engagement copy kept:           PASS
[5.2] Distinct item survived:                PASS
```

## Notes carried forward to D2

1. **Fixture insight:** genuinely-reworded updates embed at 0.64–0.83 — **below** the floor —
   so they are already stored by today's dedup and are NOT the reported bug. The bug is the
   **near-identical-surface** update (status reversal / RC→stable / beta→stable) that shares its
   predecessor's scaffolding and clears 0.88. The committed pair set now covers both classes; the
   ceiling and judge bars are calibrated against the near-identical class specifically.
2. **Transport flakiness is real:** the first `--judge` attempt hit a transient provider error on a
   single-item batch (`choices` undefined on both primary and fallback), which the harness scored
   as a miss rather than a silent pass. This directly validates D2's no-silent-loss rule — on any
   adjudication transport failure, keep the item + `needs_review: true`, never drop.
3. Re-run `--calibrate` (and re-derive the ceiling) whenever `EMBEDDING_MODEL` changes.
