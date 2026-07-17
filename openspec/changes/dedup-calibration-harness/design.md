## Context

Semantic dedup today (`newsIngestion.utils.ts:58-82`) drops any candidate with cosine similarity ≥ `0.88` against the recent pool, unconditionally. That `0.88` was calibrated once against three hand-written items and only established that a genuine cross-source duplicate measures ~0.8992 (vs the earlier unverified `0.93` guess); `.env.example` marks it "do not change casually". The live calibration vehicle already exists: `src/scripts/verifySemanticDedupLive.ts`, run via `npm run verify:semantic-dedup-live`, which embeds hand-written candidates with the real embedding model, runs `dedupeSemantic` against the real recent pool, and exits nonzero on failure.

The next change (D2, `two-band-dedup-adjudication`) splits dedup into three bands — below `0.88` accept, at/above a **hard-duplicate ceiling** drop without an LLM, and in between adjudicate with a batched LLM judge. That design cannot ship on guessed numbers: the ceiling and the judge's accuracy must be measured against the real embedding model and the real LLM first. This change is that measurement, and nothing more. Its output (two numbers plus an accuracy report) gates D2.

The LLM-batch pattern this harness's `--judge` mode mirrors is `categorizeBatch` (`newsIngestion.categorize.ts`): `BATCH_SIZE = 10`, strict-JSON system prompt ("Respond with ONLY a strict JSON array, no markdown fences"), `temperature: 0.3`, fence-stripping parse, per-batch and per-item fallback. `chatCompletion` (`lib/llmClient.ts:44-62`) already retries once on `LLM_MODELS.fallback` when the primary errors, so the judge gets transport failover for free.

## Goals / Non-Goals

**Goals:**
- Produce a committed, hand-labeled pair set (~35 pairs) covering true duplicates, progressive updates (incl. status reversals), and same-topic-distinct pairs — reusable as D2's test fixtures and the permanent regression suite for any later prompt/model/embedding change.
- Measure per-class embedding-similarity distributions and propose the hard-duplicate ceiling from the update class's maximum.
- Measure the D2 adjudication prompt's per-class verdict accuracy against `LLM_MODELS.standard` and report pass/fail against asymmetric bars (≥ 90 % duplicates, ≥ 95 % updates).
- Keep the existing three-item regression runnable and passing.

**Non-Goals:**
- No pipeline behavior change. This change touches no app module, no config, no schema, no `dedupeSemantic`.
- No tuning of `0.88` — this change *proposes* numbers; D2 *applies* them.
- No CI wiring — the script spends real embedding + LLM money and is run manually, like the original calibration.
- No insertion of calibration items into `news_items` — the harness works in memory against the real recent pool.

## Decisions

**1. Pairs are checked in, not generated.**
LLM-generated pairs would test the judge against its own output distribution. The pairs are hand-written and committed in `dedupCalibrationPairs.ts`, anchored on the reported scenario (a fictional "Fable" product is fine — embeddings don't care) plus real-world-shaped tech news. Alternative (generate pairs at runtime) rejected: non-reproducible and circular.

**2. One prompt, defined here in final form, imported by D2.**
`ADJUDICATION_SYSTEM_PROMPT` lives in `dedupCalibrationPairs.ts` and is imported by D2's adjudicator — measured before it ships, regression-tested after. Final text:

```
You judge pairs of tech news items. Item A is OLDER, item B is NEWER (by published date).
For each pair decide:
- "duplicate": both describe the SAME event/announcement with no new information (paraphrase, cross-post, syndication).
- "update": the same ongoing story, but B contains a MATERIAL development A does not (status change, reversal, new release, ban/unban, new numbers).
- "distinct": different stories that merely share a topic.
Respond with ONLY a strict JSON array, no markdown fences:
[{ "id": <n>, "verdict": "duplicate"|"update"|"distinct", "note": "<one short sentence: what changed, or why duplicate/distinct>", "confidence": <0-1> }]
```

**3. Ceiling proposal is derived, not chosen.**
`--calibrate` proposes `HARD_DUP = max(update-class cosine) + 0.005`. The margin sits just above the highest-scoring genuine update so no update falls in the no-LLM drop band. An update pair scoring above *every* duplicate pair is flagged as a future few-shot candidate rather than forcing the ceiling higher — pushing the ceiling up to swallow it would also swallow real duplicates.

**4. Judge-bar contingency is explicit, never silent.**
If `LLM_MODELS.standard` misses the ≥ 95 % update bar: first add the worst-missed pairs as few-shot examples in the prompt and re-run; only if still failing, record that D2 must escalate low-confidence verdicts to `LLM_MODELS.content` (two-tier judge). The default model is never silently switched — that is a cost decision the D2 proposal must carry explicitly.

**5. Manual gate, not CI.**
~35 pairs keep the live embedding + LLM spend bounded. The script stays a manually-run gate like the original calibration; wiring it into CI would spend money on every push.

## Risks / Trade-offs

- **Hand-written pairs may not span the real distribution** → anchor updates on the concrete reported classes (status reversal, version release, metric update, follow-up analysis) and keep the set as the living regression suite; new missed cases get appended over time.
- **Judge misses the update bar** → the design-4 contingency (few-shot, then two-tier) is recorded in the D2 proposal rather than blocking; D2 still fixes the reported bug because its failure discipline keeps items on any judge failure.
- **Real-money API calls** → bounded pair count (~35), no CI wiring, run on demand.
- **Embedding model changes later invalidate the ceiling** → the pair set is committed precisely so the ceiling can be re-derived by re-running `--calibrate` whenever `EMBEDDING_MODEL` changes.

## Migration Plan

Pure tooling addition — nothing to deploy or roll back. Sequence: build the script → run `--calibrate` live (record the proposed ceiling, expected ≈ 0.97, and the distribution table) → run `--judge` live (record the confusion matrix and bar pass/fail, or the contingency) → paste both into the D2 proposal. Rollback is deletion of two script files.

## Open Questions

- Final measured ceiling value (resolved by running `--calibrate` live; expected ≈ 0.97).
- Whether `LLM_MODELS.standard` clears the update bar unaided, or whether D2 must carry the few-shot / two-tier escalation (resolved by running `--judge` live).
