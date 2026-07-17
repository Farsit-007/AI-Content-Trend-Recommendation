## ADDED Requirements

### Requirement: Two-Band Semantic Dedup With Gray-Band Adjudication

Semantic dedup SHALL classify each candidate by its highest cosine similarity against the recent stored pool and in-run accepted items: below the semantic threshold (default 0.88) the candidate proceeds unchanged; at or above the hard-duplicate ceiling (`NEWS_INGESTION_HARD_DUP_THRESHOLD`, default 0.9443, calibrated) it is dropped without an LLM call; between the two it is adjudicated by a batched LLM judge (batches of 10, standard model, shared calibrated prompt, explicit older/newer ordering) yielding `duplicate` (drop), `update` (store), or `distinct` (store). Candidates SHALL be processed in ascending `published_at` order (missing dates last). At most `NEWS_INGESTION_ADJUDICATION_MAX_BATCHES` (default 5) batches SHALL run per pipeline run.

#### Scenario: Material update survives (the reported bug)

- **WHEN** "Fable banned from public access" arrives while "Fable released" was stored yesterday, their similarity falls in the gray band, and the judge returns `update`
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

On adjudication call failure, unparseable or invalid verdict output, or gray pairs beyond the per-run batch cap, the affected candidates SHALL be stored with `needs_review: true` — never dropped. Verdicts with confidence below 0.5 SHALL be honored but also set `needs_review: true`. An `update` verdict whose candidate is older than its match SHALL be treated as `distinct` (stored, not linked backwards).

#### Scenario: LLM outage drill

- **WHEN** every adjudication call fails during a run with gray-band candidates
- **THEN** all gray-band candidates are stored with `needs_review: true`, zero items are dropped by adjudication, and the run's `fallbacks` counter equals the pair count

#### Scenario: Low-confidence verdict is flagged

- **WHEN** the judge returns a verdict with confidence below 0.5
- **THEN** the verdict is applied and the affected item is stored with `needs_review: true`

### Requirement: Duplicate Evidence Is Absorbed as Corroboration

When a candidate is dropped as a hard or judged duplicate of a stored item, the stored item SHALL gain a corroboration entry (source, points, comments, url, time; capped at 10 entries), an engagement-history snapshot reflecting the augmented totals, and a recomputed `current_trend_score` using the shared scoring function with corroboration-augmented engagement. In-run duplicate pairs SHALL keep the higher-engagement copy with the loser absorbed the same way before insert.

#### Scenario: Multi-community story gets stronger, not duplicated

- **WHEN** the same story is dropped as a duplicate against a stored item from another source
- **THEN** the stored item's corroborations grow by one, its `current_trend_score` is recomputed upward, and the feed still shows one card

### Requirement: Adjudication Observability

Each ingestion run document SHALL record gray-pair count, batches used, verdict counts per class, and fallback count.

#### Scenario: Cost drift is visible

- **WHEN** an admin inspects recent ingestion runs
- **THEN** each run shows how many pairs were adjudicated and with what outcomes
