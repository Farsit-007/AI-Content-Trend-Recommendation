## Context

Today's Layer 2b (`dedupeSemantic`, `newsIngestion.utils.ts:96`) drops any candidate whose cosine similarity ≥ `0.88` against the recent pool — `continue`, no second look; in-run matches keep the higher `engagementWeight` copy and discard the loser's evidence. `fetchRecentEmbeddings` returns bare `number[][]` — nothing to adjudicate against or link to.

D1 (`dedup-calibration-harness`, archived) measured, against the real embedding model:
- duplicate cosine 0.8347–0.9343 (median 0.9010); update 0.6409–0.9393 (median 0.8328); distinct 0.3581–0.6479.
- **Proposed hard-dup ceiling = 0.9443** (max update 0.9393 + 0.005 margin) — above the 0.88 floor, so the gray band `[0.88, 0.9443)` is non-empty.
- The `LLM_MODELS.standard` judge, on the shared `ADJUDICATION_SYSTEM_PROMPT`, scored **duplicate 100% / update 100%** over the gray-band pairs — clears the ≥90%/≥95% bars with no few-shot or two-tier escalation.

R1/R2/R3 are archived: `engagement_history` + `computeCurrentTrendScore` (pure, exported) + the dedup ledger all exist. R2's plan promised `computeCurrentTrendScore` purity precisely so this change's corroboration recompute can call it.

The batch-LLM discipline to copy is `categorizeBatch` (`newsIngestion.categorize.ts`): batches of 10, strict-JSON system prompt, `temperature 0.3`, fence-stripping parse, per-batch + per-item fallback. `chatCompletion` already fails over to `LLM_MODELS.fallback` on transport error (confirmed live in D1 — a transient error occurred and was handled), so the adjudicator's own fallback discipline is for *parse/verdict* failures, not transport.

## Goals / Non-Goals

**Goals:**
- Store material updates instead of dropping them (fix the reported bug), while still dropping genuine duplicates.
- Absorb every dropped duplicate's engagement as corroboration on the surviving item (recomputing its live score), so a multi-community story gets stronger, not duplicated.
- Keep `dedupeSemantic` a pure, synchronous, testable band-router; all writes happen in the service layer.
- Never lose an item to infrastructure failure — degrade to keep + `needs_review: true`.

**Non-Goals:**
- Story chains / `story_id` / `update_note` (D3). D2 threads the adjudicator `note` through in memory but does **not** store it.
- The hash-dedup same-URL engagement refresh (D4) and story-aware retention (D5).
- Diff-embeddings, entity/event state machines, dropping semantic dedup, a human review queue as the primary mechanism, full-article fetching, new sources (all rejected in the deep-dive §6).
- Any frontend work: `Feed.tsx` is a stub; there is no feed UI to migrate.

## Decisions

**1. Pure band-router, effectful orchestration.** `dedupeSemantic` stays synchronous/pure (testable without Mongo/LLM) and returns `{ accepted, hardDuplicates, grayPairs }`; all writes (corroborations, verdict application) happen in `newsIngestion.service.ts`. The signature changes — both call sites (service, verify script) update in the same commit. *Alternative rejected:* effects inside the router — untestable, couples LLM/Mongo into a pure step.

**2. Best match, not first match.** The router records the *highest-similarity* match (pool and in-run compared together), so adjudication always judges against the nearest neighbor. This is what makes transitive drift work later (D3: chapter 4 matches chapter 3, not chapter 1).

**3. Directional ordering inside a pair.** A = older by `published_at` (fall back to "stored item is A" when the candidate lacks a date). `update` semantics are directional — B carries the development. If the *candidate* is older than the match (late-arriving syndication), a `duplicate` verdict still drops it, but an `update` verdict for an older candidate is treated as `distinct` (store, don't chain backwards). Encode this guard in verdict-application code, not the prompt.

**4. Batch cap = cost bound, not a drop.** `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES` (default 5) bounds LLM cost per run. Pairs beyond the cap take the fallback path (keep + needs_review), never a silent drop. At current volumes (0–2 batches/run typical) the cap should never bind.

**5. Hard duplicates skip the LLM by definition** — near-verbatim copies (≥ ceiling) don't need a judge; this keeps the ceiling meaningful and cost bounded.

**6. Missing `published_at` (GH scrape items):** sort last (treated as newest); they're absent from the recent pool (existing behavior), so they can only gray-match in-run — acceptable.

**7. Corroboration-augmented score recompute reuses R2.** Effective engagement = stored `engagement` + Σ`corroborations` (points/comments/stars respectively), fed to `computeCurrentTrendScore(item, now)` as the latest snapshot. Never re-derive decay/velocity here — one formula, owned by R2.

**8. Counters are run-level, not per-source.** A gray pair spans two sources; per-source attribution is arbitrary. `semantic_deduped` per source keeps its existing derivation and now includes both hard-dup drops and `duplicate`-verdict drops — the layer-count invariant (`fetched = drops + stored`) holds because survivors are exactly `deduped`.

**9. No engagement merge for `distinct` or `update`** — evidence absorption is only for items judged to be the *same information*.

**10. The adjudicator note is not stored in D2.** It is carried in memory for corroboration logging only; D3 introduces `update_note`. This keeps D2's schema delta to just `corroborations`.

## Risks / Trade-offs

- **[LLM cost/latency drift]** → run-level `adjudication` counters make gray-pair volume and batch count visible per run; the 5-batch cap bounds worst case; background cron tolerates the added latency.
- **[A false "duplicate" loses news]** → asymmetric by design: the calibrated judge cleared the ≥95% update bar; low-confidence and any failure keep the item with `needs_review: true`.
- **[Backwards chains from an older candidate]** → design-3 guard demotes an `update` verdict on an older candidate to `distinct`; must be covered before D3 builds chains on it.
- **[Layer-count math breaks]** → `dedupedCounts` must count the *final survivors*; asserted in verification (fetched = drops + stored).
- **[`$slice` misuse]** → the 10-entry cap goes in the update operator (`$push … $slice: -10`), not the schema.

## Migration Plan

Additive schema (`corroborations`, optional `adjudication` subdoc) — no backfill needed; legacy items simply have no corroborations. Two new env vars, both optional-with-default; the server boots with neither set. Deploy is a normal release; rollback is reverting the code — no data migration to undo (corroboration writes are additive and idempotent-safe). `NEWS_INGESTION_HARD_DUP_THRESHOLD` ships at D1's measured `0.9443`; recalibrate via the D1 harness whenever `EMBEDDING_MODEL` changes.

## Open Questions

- None blocking. If run history later shows the 5-batch cap binding regularly, revisit the cap (a signal, not a silent raise). If a future embedding model shifts the distributions, re-run D1's `--calibrate`/`--judge` before changing the ceiling.
