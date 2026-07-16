# FARSIT — Progressive-Trend Dedup (Updates vs Duplicates): OpenSpec Execution Plan

**Problem (as reported):** Progressive-trend stories are wrongly dropped as duplicates — "Fable released" → "Fable banned" → "Fable public again" all embed near-identically, so the follow-ups die at semantic dedup and the trend's most newsworthy moments never reach the feed.
**Parent analysis:** [MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md](./MASTER_FARSIT_RAVI-NEWS-PIPELINE-ANALYSIS.md) — Problem 4 (§3 interlocks, §4 Phase 5) and [FARSIT-NEWS-PIPELINE-DEDUP-UPDATES.md](./FARSIT-NEWS-PIPELINE-DEDUP-UPDATES.md) (the design deep-dive).
**Sibling plans reconciled (read before executing):** [RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md](./RAVI-NEWS-SOURCES-OPENSPEC-PLAN.md) (executed & archived — baseline), [FARSIT-NEW-SOURCES-OPENSPEC-PLAN.md](./FARSIT-NEW-SOURCES-OPENSPEC-PLAN.md) (7 upcoming adapters — Problem 2), [FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md](./FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md) (retention R1–R4 — Problem 3). This plan **fulfills the obligations** the retention plan hands over in its §0.3.B (story-liveness archive protection, whole-story archival, corroboration score recompute) and §0.3.C (same-URL engagement-refresh hook at hash dedup).
**Date:** 2026-07-16

> Every fact below was re-verified directly against the code on 2026-07-16. Line references supersede the deep-dive's where they differ; §0.2 lists where the deep-dive is out of date.

This plan decomposes the fix into **5 OpenSpec changes**. For each change, run:

```
/opsx:propose   → feed it the change's "Proposal input" + "Design decisions" + "Spec delta" + "Tasks" sections
/opsx:apply     → implement the generated tasks
verify          → run the change's "Verification" steps
/opsx:archive   → archive when the change's verification passes
```

One change at a time: propose → validate (`openspec validate <id> --strict` if available) → apply → verify → archive, then the next.

---

## 0. Verified baseline (read before proposing anything)

### 0.1 Facts (all verified 2026-07-16)

| Fact | Location |
|---|---|
| **The kill site:** `dedupeSemantic` unconditionally drops any candidate with cosine ≥ threshold (0.88) vs anything in the recent pool — `continue`, no second look. In-run matches are resolved by keeping the higher `engagementWeight` copy and **discarding the loser's evidence entirely** | `newsIngestion.utils.ts:58-82` |
| `engagementWeight = raw_points + 2·raw_comments + 3·raw_stars_delta` | `newsIngestion.utils.ts:51` |
| `fetchRecentEmbeddings(cutoff)` returns **bare `number[][]`** — no ids, no text, nothing to adjudicate against or link to. Filters `published_at: { $gte: cutoff }` (72 h window) | `newsIngestion.utils.ts:46-49` |
| The pipeline calls it with `dedupCutoff = now − max_age_hours` and passes `config.news_ingestion.semantic_dedup_threshold` | `newsIngestion.service.ts:197-199` |
| **The LLM-batch pattern to copy** (`categorizeBatch`): `BATCH_SIZE = 10`; strict-JSON system prompt ("Respond with ONLY a strict JSON array, no markdown fences"); `temperature: 0.3`; fence-stripping `parseLlmResponse`; per-batch fallback on call failure or unparseable JSON; per-item fallback on missing id / invalid enum / out-of-range numbers; `Promise.all` over batches | `newsIngestion.categorize.ts:5,30-38,40-95,97-105` |
| `chatCompletion` already retries once on `LLM_MODELS.fallback` when the primary model errors — the adjudicator gets model failover for free; its own fallback discipline is for *parse/verdict* failures, not transport | `lib/llmClient.ts:44-62` |
| `needs_review: Boolean` already exists on the model (set today from categorization confidence) | `newsItem.model.ts:31`, `newsIngestion.service.ts:226` |
| Stored-item insert: `insertMany(payloads, { ordered: false })`; payload assembled at | `newsIngestion.service.ts:229-265` |
| Mongoose `insertMany` accepts pre-generated `_id`s in payloads (needed for in-run story linking) | — |
| `IngestionRun` doc: run-level fields + per-source `sources[]` with the six layer counts; `semantic_deduped` is derived as `afterUnique − afterDeduped`. Adding **run-level** counters is additive; changing `ISourceRunCount` is not needed | `IngestionRun/ingestionRun.interface.ts`, `newsIngestion.service.ts:83-114` |
| The semantic-dedup layer's per-source count comes from `dedupedCounts = countBySource(deduped)` — whatever the reworked dedup returns as "survivors" keeps the count math balanced automatically | `newsIngestion.service.ts:200` |
| Live-verify script exists and runs via `npm run verify:semantic-dedup-live`; it embeds hand-written candidates with the real embedding model, runs `dedupeSemantic` against the real recent pool, and exits nonzero on failure — the calibration vehicle the deep-dive §7 prescribes | `src/scripts/verifySemanticDedupLive.ts`, `backend/package.json:25` |
| Semantic threshold 0.88 documented as calibrated (genuine cross-source duplicate measured 0.8992 vs the old 0.93 guess); `.env.example` marks it "do not change casually" | archived `filter-pipeline` design; `config/index.ts:73` |
| Config pattern: zod strings with defaults, `superRefine` for cross-field checks, `Number()` in export | `config/index.ts:17-113` |
| Report opportunities: `NewsItem.find({ processed: true }).sort({ created_at: -1 }).limit(50)`; chat pool: `find({}).sort(trend/current_trend)`; auto-gen: top-3 by opportunity — all list-surface queries that must show only a story's latest chapter once chains exist | `report.opportunities.ts:41-44`, `chat.retrieval.ts:58-63`, `generatedContent.job.ts:40-42` |
| Retention plan artifacts assumed present for the dependent changes (D2/D4/D5): `engagement_history` + `ENGAGEMENT_FETCHERS`/`REFRESHABLE_SOURCES` (R1), exported pure `computeCurrentTrendScore` + `current_trend_score` (R2), `protectionClauses` array in the retention job + lifecycle states (R4) | FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md |
| `story_id`, `story_seq`, `supersedes`, `update_note`, `corroborations`, `is_latest_chapter` exist **nowhere** yet | grep confirms |
| GH Trending scrape-path items have `published_at: undefined`; API-path items have it — matters for candidate ordering (D2 design 6) and the recent-pool membership | `adapters/githubTrending.ts:56,120` |

### 0.2 Corrections to FARSIT-NEWS-PIPELINE-DEDUP-UPDATES.md (do not copy these parts of the deep-dive)

1. **Caveat 6 (feed/API contract coordination) is moot.** `frontend/src/pages/dashboard/Feed.tsx` is a "Coming soon" stub; there is **no** `frontend/src/components/feed/` directory, **no** `frontend/src/lib/mock/news.ts`, and no news API client in `frontend/src/lib/api/` (only auth + ingestionRuns). The CLAUDE.md file tree is aspirational, not actual. Consequence: the story-timeline response shape is greenfield — design it additively anyway (other consumers exist server-side), but there is no feed UI to migrate and **no frontend timeline work in this plan's critical path** (D3 limits frontend scope to type definitions).
2. **Adjudication counters go on the run document, not per-source.** The deep-dive (§8.2) says "`ingestion_runs` gains adjudicated/verdict counters" without placement. Per-source placement would force `ISourceRunCount` churn and per-source attribution is ambiguous (a gray pair spans two sources). They are **run-level** fields (D2 design 8).
3. **Engagement merge must reuse retention R2's scoring, not invent one.** The deep-dive predates the retention plan's split; the corroboration recompute calls the exported pure `computeCurrentTrendScore` with corroboration-augmented engagement (D2 design 7) — never a second formula.
4. **`update` verdicts are valuable before chains exist.** The deep-dive presents two-band dedup and story chains as one design; they ship as two changes here. D2 alone fixes the reported bug (updates stored instead of dropped); D3 adds the linking. The adjudicator returns `note` from day one so D3's `update_note` needs no prompt change.

### 0.3 Dependency matrix (this plan × the retention plan)

| Change | Hard prerequisites | Why |
|---|---|---|
| D1 calibration harness | none (needs `OPENROUTER_API_KEY` + DB to run) | pure tooling |
| D2 two-band dedup + adjudication + corroborations | retention **R1 + R2 archived**; D1's calibration numbers | corroboration merge writes `engagement_history` snapshots and recomputes `current_trend_score` via R2's exported function |
| D3 story chains | D2 | chains are created by `update` verdicts |
| D4 hash-dedup engagement refresh | retention **R1 + R2** (NOT D2/D3) | updates `engagement_history` + recomputes the score; independent of the semantic-band work |
| D5 story-aware retention | D3 + retention **R4** | adds the story-liveness clause to R4's `protectionClauses` |

Recommended execution order: **D1 → D2 → D3 → D5**, with **D4 slotted anytime after retention R2** (even before D1). This matches the master roadmap (Phase 5 after Phases 3–4). If retention has not shipped yet, only D1 can start.

### 0.4 Global conventions for all 5 changes

1. **Capability naming:** new capability `dedup-adjudication` (D1, D2), new capability `story-chains` (D3); D4 is MODIFIED `news-ingestion`; D5 is MODIFIED `news-retention` (created by the retention plan's R3/R4). `openspec/specs/` is still empty — write full restated requirements with `#### Scenario:` blocks, never bare diffs.
2. **The no-silent-loss rule is the constitution of this plan:** any infrastructure failure (LLM down, unparseable verdict, batch cap exceeded) degrades to **keep the item + `needs_review: true`** — never to a drop. A false keep costs one redundant card; a false drop loses news forever. Copy `fallbackCategorize`'s discipline (`newsIngestion.categorize.ts:22-28`).
3. **Env-var rule:** every new var optional-with-safe-default in zod `envSchema` + exported config block + documented in `backend/.env.example`; server boots with none set. Cross-field checks in the existing `superRefine`.
4. **Threshold discipline:** 0.88 keeps its exact meaning (floor of the gray band = today's threshold). All new thresholds are calibrated by D1 before D2 ships, and recalibrated whenever `EMBEDDING_MODEL` changes (master §5.3). Never hand-tune in production without re-running the harness.
5. **Determinism:** sort dedup candidates by `published_at` ascending (missing dates last) before the greedy loop so chains build chronologically and reruns are reproducible (deep-dive caveat 5).
6. **Additive API only:** new response fields, no removals or renames; `IngestionSummary`'s HTTP shape unchanged.
7. **Out of scope (rejected in deep-dive §6 — do not sneak in):** diff-embeddings, entity/event state machines, dropping semantic dedup, human review queue as primary mechanism, full-article fetching, `content_hash` semantic changes, new sources.

---

## Change D1 — `dedup-calibration-harness`

**Deep-dive:** §7. **Effort:** ~half a day + one live run. **Tooling only — zero pipeline behavior change.** Its output (two numbers + an accuracy report) gates D2.

### Proposal input (for `/opsx:propose`)

**Why:** The 0.88 threshold was calibrated once with 3 hand-written items and proved the duplicate band starts at ~0.899. The two-band design needs two more empirically-set values — the hard-dup ceiling (proposed 0.97) and evidence that a cheap LLM can adjudicate the gray band accurately — before any pipeline change ships. Guessing either reintroduces the original sin (the un-verified 0.93 guess).

**What changes:**
- Extend `backend/src/scripts/verifySemanticDedupLive.ts` (same npm script) with a **labeled pair set** (~35 pairs, hand-written, committed in a new `src/scripts/dedupCalibrationPairs.ts` so D2's unit tests can import the same fixtures): ~10 true duplicates (paraphrase / cross-post / syndication), ~15 progressive updates covering the reported classes (status reversal "released→banned", version release, metric update, follow-up analysis), ~10 same-topic-distinct pairs.
- New script mode `--calibrate`: embeds all pairs with the real model, prints per-class cosine similarity distributions (min/median/max), and proposes `HARD_DUP` = max observed update-class similarity + 0.005 margin. Any *update* pair scoring above every *duplicate* pair is flagged as a future few-shot candidate rather than forcing the ceiling up (deep-dive §7.2).
- New script mode `--judge`: runs the D2 adjudication prompt (defined here, in its final form) over all gray-band pairs with `LLM_MODELS.standard` and prints a confusion matrix. **Acceptance bar (asymmetric by design):** ≥ 90 % correct on duplicates, ≥ 95 % correct on updates (false "duplicate" = lost news = the expensive error).
- Preserves the existing default mode (the original 3-item regression, including the 0.8992 cross-source pair class) so prior guarantees keep being re-checkable.
- Records results as console output to be pasted into the D2 proposal; the pair set doubles as the permanent regression suite for any later prompt/model/embedding change.

**Capabilities:** ADDED `dedup-adjudication` (calibration-tooling requirement only; pipeline requirements arrive in D2).

**Impact:** `src/scripts/verifySemanticDedupLive.ts` (extend), new `src/scripts/dedupCalibrationPairs.ts` (fixtures + shared prompt text), `backend/package.json` (optionally `verify:dedup-calibrate` alias). No app-module changes, no config, no schema.

### Design decisions

1. **Pairs are checked in, not generated.** LLM-generated pairs would test the judge against its own distribution. Write them by hand, anchored on the reported scenario (a fictional "Fable" product works fine — embeddings don't care) plus real-world-shaped tech news.
2. **The adjudication prompt lives in `dedupCalibrationPairs.ts` and is imported by D2's adjudicator** — one prompt, measured before it ships, regression-tested after. Prompt (final form, deep-dive §3.1 with explicit ordering):
   ```
   You judge pairs of tech news items. Item A is OLDER, item B is NEWER (by published date).
   For each pair decide:
   - "duplicate": both describe the SAME event/announcement with no new information (paraphrase, cross-post, syndication).
   - "update": the same ongoing story, but B contains a MATERIAL development A does not (status change, reversal, new release, ban/unban, new numbers).
   - "distinct": different stories that merely share a topic.
   Respond with ONLY a strict JSON array, no markdown fences:
   [{ "id": <n>, "verdict": "duplicate"|"update"|"distinct", "note": "<one short sentence: what changed, or why duplicate/distinct>", "confidence": <0-1> }]
   ```
3. **If the judge misses the update bar with `LLM_MODELS.standard`:** first add the worst-missed pairs as few-shot examples in the prompt and re-run; only if still failing, record that D2 must escalate low-confidence verdicts to `LLM_MODELS.content` (two-tier judge, deep-dive §7.3). Do not silently switch the default model — that's a cost decision the D2 proposal must carry explicitly.
4. **The script hits real money APIs** (embeddings + LLM) — keep the pair count ~35 and don't wire it into CI; it is a manually-run gate, like the original calibration.

### Spec delta (capability `dedup-adjudication`, ADDED)

```markdown
## ADDED Requirements

### Requirement: Dedup Calibration Harness With Labeled Pair Set
The repository SHALL provide a live calibration harness (extending the existing
semantic-dedup verify script) with a committed, hand-labeled pair set covering
true duplicates, progressive updates (including status reversals), and
same-topic-distinct pairs. The harness SHALL measure per-class embedding
similarity distributions against the configured embedding model, propose the
hard-duplicate ceiling from the update class's maximum, and measure the
adjudication prompt's verdict accuracy per class with the standard LLM. The
original three-item regression (cross-source duplicate collapse, engagement
tie-break, distinct survival) SHALL remain runnable and passing.

#### Scenario: Threshold proposal from measured distributions
- **WHEN** the harness runs in calibrate mode
- **THEN** it prints per-class similarity min/median/max and a proposed hard-dup ceiling derived from the update class's maximum plus a margin

#### Scenario: Judge accuracy report
- **WHEN** the harness runs in judge mode
- **THEN** it prints a confusion matrix over the gray-band pairs and pass/fail against the ≥90% duplicate / ≥95% update bars

#### Scenario: Legacy regression preserved
- **WHEN** the harness runs in its default mode
- **THEN** the original near-duplicate-collapse and distinct-survival checks still execute and pass
```

### Tasks

```markdown
## 1. Fixtures + prompt
- [ ] 1.1 `src/scripts/dedupCalibrationPairs.ts`: export `CALIBRATION_PAIRS: { a: {title, snippet}, b: {title, snippet}, label: 'duplicate'|'update'|'distinct', klass: string }[]` (~35, hand-written per design 1) and `ADJUDICATION_SYSTEM_PROMPT` (design 2, verbatim)

## 2. Harness
- [ ] 2.1 Extend `verifySemanticDedupLive.ts`: `--calibrate` mode (embed pairs, per-class cosine distribution table, proposed ceiling = max(update-class) + 0.005, flag update pairs scoring above all duplicate pairs)
- [ ] 2.2 `--judge` mode: for pairs whose similarity ≥ semantic threshold, run batches of 10 through `chatCompletion` with the shared prompt; print confusion matrix + per-bar pass/fail; exit nonzero on bar failure
- [ ] 2.3 Keep default mode intact; add `verify:dedup-calibrate` npm alias (optional)

## 3. Verification
- [ ] 3.1 `npm run build` passes (script compiles); default mode still passes live
- [ ] 3.2 Run `--calibrate` live: record the proposed ceiling (expected ≈ 0.97) and paste the distribution table into the D2 proposal
- [ ] 3.3 Run `--judge` live: bars met (or the few-shot/two-tier contingency from design 3 recorded in the D2 proposal)
```

**Pitfalls:** don't insert calibration items into `news_items` (the script works in memory against the real pool — keep it that way); don't let anyone "quickly tune" 0.88 while in here — this change proposes numbers, D2 applies them.

---

## Change D2 — `two-band-dedup-adjudication`

**Deep-dive:** §3 (all), §8.1–8.2. **Depends on:** D1 numbers; retention R1+R2 archived (§0.3). **Effort:** 1.5–2 days.
**This change alone fixes the reported bug** — updates get stored instead of silently dropped. Chains (D3) make them *presentable*.

### Proposal input

**Why:** `dedupeSemantic` unconditionally drops any candidate ≥ 0.88 cosine-similar to a recently stored item. Calibration proved true duplicates and material updates overlap in the 0.88–0.97 band — no scalar threshold separates "same information" from "same topic, new information." Distinguishing them requires reading the content: a batched LLM adjudication for the gray band only, with hard duplicates (≥ ceiling) still dropped without an LLM call, and every dropped duplicate's engagement absorbed as corroboration instead of evaporating.

**What changes:**
- **Wider recent pool:** `fetchRecentEmbeddings` returns `{ _id, embedding, title, snippet, published_at, story_id?, story_seq? }[]` instead of bare vectors (same single query, wider projection; story fields projected now so D3 doesn't touch this again). All call sites updated (`newsIngestion.service.ts:198`, the verify script).
- **`dedupeSemantic` reworked into a pure band-router** (same file): sorts candidates by `published_at` ascending (missing dates last), then for each candidate finds the best match across recent pool ∪ accepted-in-run; returns `{ accepted, hardDuplicates: [{candidate, match}], grayPairs: [{candidate, match}] }`. `< floor` → accepted (today's behavior); `≥ ceiling` → hardDuplicates (no LLM); in between → grayPairs. The old in-run higher-engagement tie-break is subsumed: an in-run pair ≥ ceiling keeps the higher-engagement copy and the loser becomes a corroboration on it (deep-dive §3.3 "absorbs instead of discards").
- **New adjudicator `newsIngestion.adjudicate.ts`:** batches of 10 gray pairs, `LLM_MODELS.standard`, `temperature 0.3`, shared prompt from D1 (`ADJUDICATION_SYSTEM_PROMPT`), pair ordering by `published_at` (A = older). Verdicts: `duplicate` → drop candidate + corroborate the match; `update` → store candidate (D3 will also chain it), carry `note` + `confidence`; `distinct` → store normally. **Failure discipline:** call failure, unparseable JSON, missing id, invalid verdict, or exceeding the per-run batch cap (`NEWS_INGESTION_ADJUDICATION_MAX_BATCHES`, default 5) → verdict `update` with `confidence: 0` → keep + `needs_review: true`. Real verdicts with `confidence < 0.5` are honored but also set `needs_review: true`.
- **Corroborations:** new schema field `corroborations: [{ source, points, comments, url, at }]` capped at 10 (`$slice`). On every hard-dup drop and `duplicate` verdict whose match is a *stored* item: push the candidate's engagement evidence, push an `engagement_history` snapshot reflecting corroboration-augmented totals, and recompute the match's `current_trend_score` via retention R2's exported `computeCurrentTrendScore` with corroboration-augmented engagement (design 7). For *in-run* matches, absorb in memory before insert.
- **Run-history counters (run-level, additive):** `IIngestionRun` gains `adjudication?: { gray_pairs, batches, verdict_duplicate, verdict_update, verdict_distinct, fallbacks }` — cost drift visible per deep-dive §8.2, Admin UI untouched (renders dynamically-known fields only where coded; no frontend change required).
- **Config:** `NEWS_INGESTION_HARD_DUP_THRESHOLD` (default `0.97`, overwritten by D1's measured value at apply time), `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES` (default `5`); `superRefine`: hard-dup ceiling > semantic threshold, both in (0,1].

**Capabilities:** MODIFIED `dedup-adjudication` (pipeline requirements added); MODIFIED `news-ingestion` (Layer 2b behavior restated).

**Impact:**
- `newsIngestion.utils.ts` — `fetchRecentEmbeddings` projection + `dedupeSemantic` rework (types exported for tests).
- New `newsIngestion.adjudicate.ts` (+ imports the D1 prompt).
- `newsIngestion.service.ts` — Layer 2b orchestration: band-route → adjudicate → apply verdicts → corroborate; `dedupedCounts` now counts the final survivors (count math unchanged); persistRun carries the adjudication block.
- `newsItem.model.ts`/`interface.ts` — `corroborations` (+ optional `adjudication_note`? **no** — the note is only stored by D3 as `update_note`; D2 threads it through in memory).
- `IngestionRun` interface + model — optional `adjudication` subdoc.
- `config/index.ts` + `.env.example` — the two vars.
- `verifySemanticDedupLive.ts` — adapt to the new `dedupeSemantic` return shape (extend the default-mode assertions: paraphrase → hardDuplicate or duplicate verdict; distinct survives).

### Design decisions

1. **Pure band-router, effectful orchestration.** `dedupeSemantic` stays synchronous and pure (testable without Mongo/LLM); all writes (corroborations, verdict application) happen in the service layer. The existing signature changes — update the two call sites (service, verify script) in the same commit.
2. **Best match, not first match:** the router records the *highest-similarity* match (pool and in-run compared together), so adjudication always judges against the nearest neighbor — this is what makes transitive drift work later (chapter 4 matches chapter 3, not chapter 1; deep-dive §4 edge cases).
3. **Ordering inside a pair:** A = older by `published_at` (fall back to "stored item is A" when the candidate lacks a date). The verdict's `update` semantics are directional — B contains the development. If the *candidate* is older than the match (rare: late-arriving syndication), a `duplicate` verdict still drops it; an `update` verdict for an older item is treated as `distinct` (store, don't chain backwards) — encode this guard in the verdict-application code, not the prompt.
4. **Batch cap semantics:** the cap bounds LLM cost per run (deep-dive §8.1). Pairs beyond the cap are NOT silently dropped — they take the fallback path (keep + needs_review). With current volumes (0–2 batches/run typical) the cap should never bind; if run history shows it binding regularly, that's a signal to revisit, not to raise silently.
5. **Hard duplicates skip the LLM by definition** — near-verbatim copies don't need a judge; this keeps the ceiling meaningful and the cost bounded.
6. **Missing `published_at` (GH scrape items):** sort last (treated as newest); they're also absent from the recent pool (existing behavior), so they can only gray-match in-run — acceptable.
7. **Corroboration-augmented score recompute:** effective engagement = stored `engagement` + Σ`corroborations` (points/comments/stars respectively), fed to `computeCurrentTrendScore` as the latest snapshot. Never re-derive the decay/velocity math here — one formula, owned by retention R2 (its plan's design decision 5 promises purity for exactly this call).
8. **Counters are run-level** (correction §0.2.2): a gray pair spans two sources; per-source attribution is arbitrary. `semantic_deduped` per source keeps its existing derivation and now includes both hard-dup drops and `duplicate`-verdict drops — the layer-count balance invariant (`fetched = drops + stored`) still holds because survivors are exactly `deduped`.
9. **No engagement merge for `distinct` or `update`** — evidence absorption is only for items judged to be the *same information*.

### Spec delta

Capability `dedup-adjudication` (ADDED requirements):

```markdown
## ADDED Requirements

### Requirement: Two-Band Semantic Dedup With Gray-Band Adjudication
Semantic dedup SHALL classify each candidate by its highest cosine similarity
against the recent stored pool and in-run accepted items: below the semantic
threshold (default 0.88) the candidate proceeds unchanged; at or above the
hard-duplicate ceiling (`NEWS_INGESTION_HARD_DUP_THRESHOLD`, default 0.97,
calibrated) it is dropped without an LLM call; between the two it is adjudicated
by a batched LLM judge (batches of 10, standard model, shared calibrated prompt,
explicit older/newer ordering) yielding `duplicate` (drop), `update` (store), or
`distinct` (store). Candidates SHALL be processed in ascending `published_at`
order (missing dates last). At most `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES`
(default 5) batches run per pipeline run.

#### Scenario: Material update survives (the reported bug)
- **WHEN** "Fable banned from public access" arrives while "Fable released" was stored yesterday and their similarity falls in the gray band, and the judge returns `update`
- **THEN** the new item is stored and the run's counters record one `update` verdict

#### Scenario: Cross-source paraphrase still dies
- **WHEN** a same-event paraphrase arrives with gray-band similarity and the judge returns `duplicate`
- **THEN** the candidate is not stored and its engagement is recorded as corroboration on the matched item

#### Scenario: Near-verbatim copy skips the judge
- **WHEN** a candidate scores at or above the hard-duplicate ceiling
- **THEN** it is dropped with no LLM call and corroboration is recorded

#### Scenario: Same-topic different story is rescued
- **WHEN** a gray-band pair is judged `distinct`
- **THEN** the candidate is stored normally

### Requirement: Adjudication Fails Toward Keeping Content
On adjudication call failure, unparseable or invalid verdict output, or gray
pairs beyond the per-run batch cap, the affected candidates SHALL be stored with
`needs_review: true` — never dropped. Verdicts with confidence below 0.5 SHALL
be honored but also set `needs_review: true`.

#### Scenario: LLM outage drill
- **WHEN** every adjudication call fails during a run with gray-band candidates
- **THEN** all gray-band candidates are stored with `needs_review: true` and zero items are dropped by adjudication, and the run's `fallbacks` counter equals the pair count

### Requirement: Duplicate Evidence Is Absorbed as Corroboration
When a candidate is dropped as a hard or judged duplicate of a stored item, the
stored item SHALL gain a corroboration entry (source, points, comments, url,
time; capped at 10 entries), an engagement-history snapshot reflecting the
augmented totals, and a recomputed `current_trend_score` using the shared
scoring function with corroboration-augmented engagement. In-run duplicate
pairs SHALL keep the higher-engagement copy with the loser absorbed the same
way before insert.

#### Scenario: Multi-community story gets stronger, not duplicated
- **WHEN** the same story is dropped as duplicate against a stored item from another source
- **THEN** the stored item's corroborations grow by one and its current_trend_score is recomputed upward, and the feed still shows one card

### Requirement: Adjudication Observability
Each ingestion run document SHALL record gray-pair count, batches used, verdict
counts per class, and fallback count.

#### Scenario: Cost drift is visible
- **WHEN** an admin inspects recent ingestion runs
- **THEN** each run shows how many pairs were adjudicated and with what outcomes
```

Capability `news-ingestion` (MODIFIED): restate the Layer 2b requirement to reference the two-band behavior (one requirement; scenarios above carry the detail).

### Tasks

```markdown
## 1. Config
- [ ] 1.1 envSchema: `NEWS_INGESTION_HARD_DUP_THRESHOLD` default '0.97' (set to D1's measured value), `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES` default '5'; export under `news_ingestion`; superRefine ceiling > threshold; `.env.example` (mark ceiling "calibrated — re-run the harness before changing")

## 2. Pool + router
- [ ] 2.1 `fetchRecentEmbeddings` → `RecentPoolEntry[]` ({_id, embedding, title, snippet, published_at, story_id, story_seq}); update both call sites
- [ ] 2.2 Rework `dedupeSemantic`: published_at-asc sort (missing last); best-match across pool ∪ accepted; return {accepted, hardDuplicates, grayPairs}; in-run ceiling pairs resolved by engagementWeight with loser attached for absorption
- [ ] 2.3 Unit tests: band routing at floor/ceiling boundaries; best-match beats first-match; deterministic ordering; in-run absorption; missing-date handling

## 3. Adjudicator
- [ ] 3.1 `newsIngestion.adjudicate.ts`: `adjudicatePairs(pairs)` — batches of 10, shared D1 prompt, temperature 0.3, standard model; parse/validate per categorize.ts discipline; per-batch and per-item fallback → {verdict:'update', confidence:0, fallback:true}; enforce batch cap with fallback for overflow
- [ ] 3.2 Unit tests (mock chatCompletion): happy path all three verdicts; fence-wrapped JSON; garbage → all-fallback; missing id → item fallback; cap overflow → fallback not drop; older-candidate `update` demoted to `distinct` (design 3 guard)

## 4. Schema + orchestration
- [ ] 4.1 `corroborations` on newsItem model/interface (subdoc array, $slice 10 on push)
- [ ] 4.2 Service Layer 2b: route → adjudicate → apply verdicts; corroborate stored matches (bulk update: $push corroborations + engagement_history snapshot, $set current_trend_score via computeCurrentTrendScore with augmented engagement); needs_review propagation into the payload build
- [ ] 4.3 `IngestionRun` optional `adjudication` subdoc + persistRun plumbing
- [ ] 4.4 Integration tests (memory server, mocked LLM + embeddings): update stored; duplicate corroborates + score rises; outage drill (zero drops); run doc counters balance
- [ ] 4.5 Adapt `verifySemanticDedupLive.ts` default mode to the new return shape

## 5. Verification
- [ ] 5.1 `npm test && npm run build`; server boots with neither new var set
- [ ] 5.2 Live: `npm run verify:semantic-dedup-live` default mode passes (0.8992-class pair still collapses — deep-dive acceptance regression)
- [ ] 5.3 Live ingest twice; run history shows the adjudication block; gray pairs ≤ cap; no run-duration blowup (background cron tolerance, deep-dive §8.1)
- [ ] 5.4 LLM outage drill live (point LLM_MODEL_STANDARD+FALLBACK at an invalid model in a dev env): gray candidates stored with needs_review, none lost
```

**Pitfalls:** the verdict guard of design 3 (older-candidate `update` → treat as `distinct`) is easy to forget and silently builds backwards chains in D3; `dedupedCounts` must count final survivors or layer math breaks; never store the adjudicator's note on the item in this change (that's D3's `update_note`); `$slice` on corroborations goes in the update operator, not the schema.

---

## Change D3 — `story-chains`

**Deep-dive:** §4. **Depends on:** D2. **Effort:** ~1–1.5 days.

### Proposal input

**Why:** With D2, updates survive — but "Fable released", "Fable banned", "Fable restored" render as three unrelated cards. Chaining `update` verdicts into stories lets every list surface show one card per story (the latest chapter) with the trail available, and gives retention the unit it must age ("a story is retired as a unit").

**What changes:**
- **Schema (`newsItem.model.ts`/`interface.ts`):** `story_id` (ObjectId, index), `story_seq` (Number), `supersedes` (ObjectId), `update_note` (String), `is_latest_chapter` (Boolean, default `true`, index).
- **Write path on an `update` verdict (in the D2 orchestration point):**
  - Match is a stored item: if it lacks `story_id`, backfill it as root (`story_id = match._id`, `story_seq = 1`) in the same `updateOne` that sets `is_latest_chapter: false`; the new item gets `story_id`, `story_seq = match.story_seq + 1`, `supersedes = match._id`, `update_note` = adjudicator note, `is_latest_chapter: true`.
  - Match is an in-run accepted candidate: pre-generate `_id`s for accepted items so chains among same-run items link identically; chapters ordered by `published_at`.
- **Read paths:** default feed query (`getAllNewsItems`), report opportunity candidates, chat news pool, and auto-generation candidates add `is_latest_chapter: { $ne: false }` (additive — legacy rows lack the field and remain visible). The feed response attaches, for items with a `story_id`, a `story: [{ _id, title, update_note, story_seq, published_at }]` array of all chapters (one batched `$in` query per page over the page's distinct story_ids). Explicit `?lifecycle=`/sort behavior untouched.
- **Frontend scope (correction §0.2.1): types only.** Add the story fields to `frontend/src/lib/api/types.ts`. There is no feed UI to change — the future Feed implementation consumes `story[]` + chapter-count for its timeline affordance; note this in the change's design doc, build nothing visual.
- **Recent-pool story fields** were already projected by D2 — the write path knows the match's `story_id`/`story_seq` without extra reads.

**Capabilities:** ADDED `story-chains`; MODIFIED `news-ingestion` (update-verdict write path).

**Impact:** `newsItem.model.ts`/`interface.ts`; `newsIngestion.service.ts` (verdict application + pre-generated `_id`s); `newsItem.service.ts` (feed filter + story attachment); `report.opportunities.ts`, `chat.retrieval.ts`, `generatedContent.job.ts` (one-line filters); `frontend/src/lib/api/types.ts`. No config, no env vars.

### Design decisions

1. **`is_latest_chapter` boolean over aggregation** (deep-dive §4 recommends it): the write path already touches both rows; a boolean keeps every hot list query index-friendly. `$ne: false` (not `: true`) so pre-existing rows without the field stay visible with zero backfill.
2. **Forks render as sequential chapters** (deep-dive edge case): two same-run updates both matching chapter 2 get consecutive `story_seq` ordered by `published_at`; only the last inserted keeps `is_latest_chapter: true`. No tree structure — ever.
3. **Chains build on nearest-chapter matches for free:** D2's best-match router means chapter 4 links to chapter 3 even when it's < 0.88 similar to chapter 1 (transitive drift).
4. **Story attachment is read-time, bounded:** one extra `$in` query per feed page (≤ page-size distinct story_ids), only chapters' light fields projected. No `$lookup`, no denormalized story arrays on write.
5. **`getSingleNewsItem` attaches the story too** (an archived or superseded chapter fetched by id should show its context) — same helper, reused.
6. **Retention note:** archiving/deleting individual chapters is retention's domain; nothing in this change filters by `lifecycle` beyond what retention R4 already installed in these queries. The story-liveness *protection* is D5.

### Spec delta (capability `story-chains`, ADDED)

```markdown
## ADDED Requirements

### Requirement: Update Verdicts Build Story Chains
When gray-band adjudication yields `update`, the system SHALL link the new item
to its matched item's story: the match (backfilled as story root with sequence 1
if unchained) is marked no longer latest, and the new item is stored with the
shared `story_id`, the next `story_seq`, a `supersedes` reference to the matched
item, the adjudicator's one-sentence `update_note`, and `is_latest_chapter:
true`. In-run chains SHALL link identically via pre-generated ids, chapters
ordered by publication time.

#### Scenario: Release → ban → restore forms one chain
- **WHEN** "Fable banned" is judged an update of stored "Fable released", and later "Fable public again" is judged an update of "Fable banned"
- **THEN** all three share one `story_id`, carry `story_seq` 1, 2, 3, each later chapter supersedes the prior, and only the last has `is_latest_chapter: true`

#### Scenario: Root backfill
- **WHEN** the matched stored item has no `story_id`
- **THEN** the same write that clears its latest flag sets its `story_id` to its own id and `story_seq` to 1

### Requirement: List Surfaces Show One Card Per Story
The default feed listing, report opportunity candidates, chat news pool, and
auto-generation candidates SHALL exclude superseded chapters
(`is_latest_chapter: { $ne: false }`), keeping items without the field visible.
Feed and single-item responses SHALL additively attach a `story` array (id,
title, update_note, story_seq, published_at per chapter) for chained items.

#### Scenario: Feed shows the latest chapter with its trail
- **WHEN** the feed is requested and a three-chapter story exists
- **THEN** exactly one card for that story appears (chapter 3) carrying a story array of all three chapters in sequence order

#### Scenario: Unchained items unaffected
- **WHEN** an item has no story_id
- **THEN** its list and single-item responses are byte-compatible with the pre-change shape except for documented additive fields
```

### Tasks

```markdown
## 1. Schema
- [ ] 1.1 Add story_id (indexed), story_seq, supersedes, update_note, is_latest_chapter (default true, indexed) to model + interface

## 2. Write path
- [ ] 2.1 In the D2 verdict-application block: stored-match case (single updateOne on match: $set is_latest_chapter:false + root backfill when unchained; new item payload carries chain fields), in-run case (pre-generate _ids for accepted payloads; link by published_at order)
- [ ] 2.2 Integration tests: 3-chapter chain across two runs (seq/supersedes/latest-flag correctness); root backfill; same-run fork → sequential seqs, single latest; older-candidate guard from D2 never chains backwards

## 3. Read paths
- [ ] 3.1 `is_latest_chapter: { $ne: false }` in getAllNewsItems default filter, report.opportunities, chat.retrieval pool, generatedContent.job candidates
- [ ] 3.2 Story attachment helper (batched $in over page story_ids; light projection; seq-ordered); wire into getAllNewsItems + getSingleNewsItem
- [ ] 3.3 Integration tests: one card per story on feed; superseded chapter reachable by id with story attached; legacy rows (no flag) still listed
- [ ] 3.4 `frontend/src/lib/api/types.ts`: optional story fields + StoryChapter type (types only — no UI; Feed.tsx is a stub)

## 4. Verification
- [ ] 4.1 `npm test && npm run build` (backend) + frontend `npm run build`
- [ ] 4.2 Live end-to-end (deep-dive §7.4, automatable in the harness): ingest "X released" → paraphrase (dropped, corroborated) → "X banned from npm" (stored, chained seq 2) → paraphrase of ban (dropped against chapter 2) — record in the archive notes
- [ ] 4.3 Feed API: one card for the chain, story array present, chapter count correct
```

**Pitfalls:** `$ne: false` everywhere (a `: true` filter hides every pre-chain item); the root backfill and the latest-flag clear must be **one** updateOne (two writes create a crash window where the story has no root); don't build a timeline UI — there is no feed UI yet (§0.2.1).

---

## Change D4 — `hash-dedup-engagement-refresh`

**Deep-dive:** §5. **Fulfills retention plan §0.3.C.** **Depends on:** retention R1+R2 only — independent of D1–D3, may ship any time after them. **Effort:** ~half a day.

### Proposal input

**Why:** A GitHub repo re-entering trending is "the same story with new numbers" — an update with an *identical URL*, caught at hash dedup, not semantic dedup. Today `dedupeAgainstStored` plain-skips it, so the stored item's engagement stays frozen at first sight and (per the retention plan, which deliberately does not re-poll `github_trending`) the item decays on age alone. Same-URL re-surfacing with fresh engagement is unambiguous — no LLM needed — and refreshing at the dedup site closes the loop for every source whose listing legitimately re-surfaces URLs (GitHub Trending now; Mastodon trending links and HN re-submissions when those ship).

**What changes:**
- `dedupeAgainstStored` (or a hook called with its results in the service): for each hash-duplicate candidate whose source is in `REINGEST_REFRESH_SOURCES` (module constant, initially `['github_trending']`) and whose engagement is non-trivial (weighted > 0), update the stored item: `$max`-style engagement refresh (take the candidate's values when higher — a trending-scrape stars-delta is a daily figure, not cumulative: replace, don't add; see design 2), push an `engagement_history` snapshot (`$slice: -32`), set `engagement_refreshed_at`, recompute `current_trend_score` via the shared function.
- The candidate is still dropped from the pipeline (no re-store, no re-embedding, no LLM) — this changes only what the drop *leaves behind*.
- Failure isolation: refresh-write failure is logged and never affects the dedup result.

**Capabilities:** MODIFIED `news-ingestion`.

**Impact:** `newsIngestion.utils.ts` / `newsIngestion.service.ts` (the existing hash-dedup call site — the ledger check added by retention R3 is untouched: tombstoned hashes are not stored items and take the plain-drop path); no config, no schema (fields exist via retention R1/R2).

### Design decisions

1. **Constant, not env var:** the eligible-source list is a code-level property of each source's semantics (is its listing a re-surfacing one?), not an operator knob. New-sources plan note: the Mastodon adapter change should append `'mastodon'` here when it ships (its trending links re-surface across runs with growing sharer counts).
2. **Replace vs accumulate:** GH `raw_stars_delta` from the trending page is "stars today" — a point-in-time reading. The refresh **replaces** the engagement fields with the fresh reading and lets `engagement_history` carry the series; velocity math (retention R2) then sees real deltas. Never sum readings — that double-counts.
3. **Ledger interplay (retention R3):** a hash matching only a *tombstone* means the item was deleted — there is nothing to refresh; plain drop. Only matches against live `news_items` rows refresh.
4. **This is the degenerate no-LLM case of the update problem** — say so in the proposal so reviewers see why it needs no adjudication.

### Spec delta (capability `news-ingestion`, MODIFIED)

```markdown
## MODIFIED Requirements

### Requirement: Same-URL Re-Surfacing Refreshes Stored Engagement
When ingestion hash-dedup drops a candidate whose content hash matches a stored
(non-tombstoned) item, and the candidate's source is one whose listings
legitimately re-surface identical URLs with fresh engagement (initially
github_trending), the stored item SHALL be refreshed: engagement replaced with
the fresh reading, an engagement-history snapshot appended, and
`current_trend_score` recomputed via the shared scoring function. The candidate
SHALL still be excluded from storage, and a refresh-write failure SHALL NOT
affect the dedup outcome.

#### Scenario: Repo trending for a third day stays alive
- **WHEN** a github_trending item re-appears with a new stars-today figure two days after first ingest
- **THEN** the stored item's engagement and history reflect the new reading, its current_trend_score is recomputed, and no duplicate row is created

#### Scenario: Tombstoned hash is not resurrected or refreshed
- **WHEN** the matching hash exists only in the dedup ledger
- **THEN** the candidate is dropped with no write

#### Scenario: Non-eligible source unchanged
- **WHEN** a hash-duplicate candidate arrives from a source not in the re-surfacing list
- **THEN** behavior is identical to today's plain drop
```

### Tasks

```markdown
## 1. Implementation
- [ ] 1.1 Export `REINGEST_REFRESH_SOURCES = ['github_trending']` and a `refreshOnReingest(candidates, storedByHash)` helper; call from the pipeline where hash-duplicates are identified (service layer keeps utils pure — mirror D2's split)
- [ ] 1.2 Bulk update per design 2 (replace engagement, $push history with $slice -32, engagement_refreshed_at, recomputed current_trend_score); try/catch + log, never throw into the pipeline

## 2. Tests
- [ ] 2.1 Unit: eligible + weighted>0 → refresh payload built; non-eligible/zero-engagement/tombstone-only → untouched; replace-not-sum on stars
- [ ] 2.2 Integration: two runs with the same GH repo at different stars-today → one row, two history snapshots, score recomputed; refresh-write failure → run still succeeds

## 3. Verification
- [ ] 3.1 `npm test && npm run build`
- [ ] 3.2 Live: two manual ingests spanning a trending repo → Mongo shows history growth on the stored row; run history unchanged in shape
```

**Pitfalls:** design 2's replace-not-sum; do not touch the retention R3 ledger path; keep the candidate dropped — this change must not create any new stored rows.

---

## Change D5 — `story-aware-retention`

**Deep-dive:** §4 "interaction with retention". **Fulfills retention plan §0.3.B.** **Depends on:** D3 + retention R4 archived. **Effort:** ~half a day.

### Proposal input

**Why:** The retention job archives items individually. Once chains exist, archiving chapter 1 while chapter 3 still trends breaks the story timeline the feed relies on, and deleting a chapter that a gray-band candidate would be judged against degrades adjudication. A story must be retired as a unit: no chapter archives while any chapter is live; when the whole story goes cold, chapters age out normally and Stage 2's per-item tombstoning automatically covers every chapter's hash.

**What changes:**
- New protection clause appended to the retention job's `protectionClauses` array (retention R4 design decision 8 built the array for exactly this): before Stage 1, compute `liveStoryIds = NewsItem.distinct('story_id', { story_id: { $ne: null }, lifecycle: { $ne: 'archived' }, current_trend_score: { $gte: NEWS_ARCHIVE_TREND_FLOOR } })`; the clause is `{ story_id: { $in: liveStoryIds } }` — chained items are archive-exempt while any sibling is at/above the floor.
- Whole-story retirement follows without extra machinery: once no chapter clears the floor, the story drops out of `liveStoryIds` and each chapter archives as it individually qualifies (max-age or floor rule) — chapter 1 can never outlive-in-archive chapter 3 by more than one retention cycle, which the verification pins.
- Stage 2 needs zero changes (it already tombstones per item), but the joint verification below proves every chapter's hash lands in the ledger.

**Capabilities:** MODIFIED `news-retention`.

**Impact:** `NewsRetention/newsRetention.service.ts` (one distinct query + one clause + counts); integration tests. No schema, no config, no frontend.

### Design decisions

1. **Liveness = at/above the trend floor among non-archived chapters** — exactly the clause the retention plan's §0.3.B recorded; use the same `NEWS_ARCHIVE_TREND_FLOOR` config value, never a second knob.
2. **`distinct` pre-query over `$lookup`:** stories are few; one indexed distinct (on the `story_id` index D3 added) is simpler and testable. Record `stories_protected: liveStoryIds.length` in the retention run's counts.
3. **A superseded chapter with `is_latest_chapter: false` is NOT thereby archived** — superseded ≠ stale; it stays active (feed hides it via the latest-chapter filter) until its story goes cold. Archive state remains retention's sole domain; chapter visibility remains D3's.

### Spec delta (capability `news-retention`, MODIFIED)

```markdown
## MODIFIED Requirements

### Requirement: Stories Are Retired as a Unit
The retention job SHALL NOT archive any item whose `story_id` has at least one
non-archived member with `current_trend_score` at or above the archive trend
floor. When no member clears the floor, members SHALL age out under the
standard archive rules, and hard deletion SHALL tombstone every chapter's
content hash. The count of protected stories SHALL be recorded in the retention
run document.

#### Scenario: Live chapter 3 protects chapter 1
- **WHEN** chapter 1 exceeds the max-age ceiling while chapter 3 of the same story is active above the trend floor
- **THEN** chapter 1 is not archived and the run records the story as protected

#### Scenario: Cold story retires whole
- **WHEN** every chapter of a story is below the trend floor past the minimum age (or beyond the max-age ceiling)
- **THEN** all chapters archive under the standard rules and, after the cooling-off period, every chapter's content hash has a tombstone

#### Scenario: Superseded is not stale
- **WHEN** a chapter is superseded (`is_latest_chapter: false`) but its story is live
- **THEN** it remains active (unarchived)
```

### Tasks

```markdown
## 1. Implementation
- [ ] 1.1 Compute liveStoryIds (distinct per design 2) at Stage-1 start; append `{ story_id: { $in: liveStoryIds } }` to protectionClauses; add stories_protected to the MaintenanceRun counts

## 2. Tests
- [ ] 2.1 Integration (memory server, backdated fixtures): live-chapter-3 protects over-age chapter 1; cold story archives fully across runs; superseded-but-live chapter untouched; unchained items unaffected (regression on R4 suite)
- [ ] 2.2 Joint Stage-2 test: cold 3-chapter story pushed through archive → cooling-off → hard delete → 3 ledger tombstones, overrides cascaded

## 3. Verification
- [ ] 3.1 `npm test && npm run build`
- [ ] 3.2 Live: build a chain (D3 §4.2 flow), force chapter 3 above floor, backdate chapter 1 past 96 h → retention run leaves it active and reports stories_protected ≥ 1 (deep-dive acceptance: "archived stories archive as a unit" — joint with the retention checklist)
```

**Pitfalls:** use `$ne: 'archived'` (not `lifecycle: 'active'`) in the liveness query for pre-backfill safety (same rule as everywhere in the retention plan); the clause protects **members of live stories**, not all chained items forever — assert the cold-story case in tests or retention silently stops cleaning chained content.

---

## Execution order & dependency summary

```
retention R1–R2 ──────────────┬────────────────────────────┐
                              │                            │
D1 calibration ──→ D2 two-band dedup ──→ D3 story chains   D4 hash-refresh (anytime after R1–R2)
                                              │
retention R4 ────────────────────────────────→ D5 story-aware retention
```

- D1 can start today (no retention dependency).
- D2 applies D1's measured ceiling; do not propose D2 with a guessed 0.97 if D1 hasn't run.
- D4 is parallelizable with everything (separate branch).
- D5 is last, and completes the obligations the retention plan recorded in its §0.3.B.

## Definition of done (maps to master doc §5 + deep-dive acceptance checklist)

- [ ] Labeled pair set committed; measured ceiling + judge confusion matrix recorded in the D2 proposal/archive notes (D1)
- [ ] End-to-end release→ban→restore scenario passes live: paraphrase dropped with corroboration, updates stored and chained seq 1→2→3, ban-paraphrase dropped against chapter 2 (D2+D3)
- [ ] True-duplicate regression: the 0.8992-class cross-source pair still collapses — now recorded as corroboration (D2)
- [ ] LLM outage drill: all gray-band items kept with `needs_review: true`, zero drops (D2)
- [ ] Feed shows a chained story as one card with the story trail attached; superseded chapters excluded from all list surfaces but fetchable by id (D3)
- [ ] Run history shows adjudication counters; gray-pair volume stays within the 5-batch cap under normal runs (D2)
- [ ] A repo trending across multiple days keeps one row with a growing engagement history and a live decayed score (D4)
- [ ] Stories archive as a unit: live chapter protects the chain; cold chain archives fully and every chapter's hash is tombstoned (D5, joint with the retention plan's DoD)
- [ ] Server boots with none of the 2 new env vars set; both documented in `.env.example`; all new behavior covered by `npm test`
