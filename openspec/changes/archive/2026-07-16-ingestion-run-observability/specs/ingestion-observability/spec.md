## ADDED Requirements

### Requirement: Persisted Ingestion Run History
The system SHALL persist one `IngestionRun` document for every pipeline run, regardless of trigger (cron or manual) and regardless of whether the run completed successfully or was aborted by an uncaught error. Each document SHALL record `started_at`, `finished_at`, `duration_ms`, `trigger` (`cron` | `manual`), and per-source counts for every pipeline layer the run reached (`fetched`, `fresh_dropped`, `hash_deduped`, `semantic_deduped`, `relevance_dropped`, `stored`), plus any per-source error message. A run aborted by an uncaught error SHALL still produce a document recording the layers that completed before the abort and a top-level error message; the pipeline SHALL still raise the error to its caller afterward. Failure to persist the run document SHALL NOT fail or roll back the ingestion itself. Run documents SHALL expire 30 days after `started_at`.

#### Scenario: Cron run persists a complete run document
- **WHEN** the scheduled ingestion completes all four layers
- **THEN** an `IngestionRun` document exists with `trigger: "cron"` and one sources entry per source label seen in the run, whose layer counts sum consistently (fetched = fresh_dropped + hash_deduped + semantic_deduped + relevance_dropped + stored)

#### Scenario: Manual run persists a complete run document
- **WHEN** an admin triggers `POST /news-items/ingest` and the pipeline completes
- **THEN** an `IngestionRun` document exists with `trigger: "manual"`

#### Scenario: Adapter error is recorded per source
- **WHEN** an adapter throws during a run
- **THEN** the run document's entry for that source has `fetched: 0` and the adapter's error message

#### Scenario: Pipeline throws before completing
- **WHEN** an uncaught error aborts the pipeline partway through a run (for example, during embedding or categorization)
- **THEN** an `IngestionRun` document still exists for that run, containing the per-source counts for every layer that completed before the abort and a top-level error message, and the original error is still raised to the caller of `runIngestionPipeline`

#### Scenario: Run persistence fails
- **WHEN** the `IngestionRun` insert itself fails
- **THEN** the pipeline's own outcome (items stored, or the error raised) is unaffected

#### Scenario: Old runs expire
- **WHEN** an `IngestionRun` document is older than 30 days
- **THEN** it is automatically removed and no longer appears in run history

### Requirement: Ingestion Run Admin Endpoint With Zero-Streak Alerting
The system SHALL expose `GET /news-items/ingestion-runs` to admin users, registered ahead of any `/:id`-shaped route on the same router, returning the most recent runs (default 20, `?limit=` capped at 100) ordered newest-first. For each source seen across the returned runs, the response SHALL include a `zero_streak` — the count of consecutive most-recent runs (walking newest to oldest, stopping at the first non-zero) in which that source fetched 0 items — computed at read time from the returned run history, with `alert: true` when `zero_streak >= 3`.

#### Scenario: Dead source is flagged
- **WHEN** a source fetched 0 items in each of the 3 most recent runs
- **THEN** the endpoint reports that source with `zero_streak: 3` (or higher) and `alert: true`

#### Scenario: Source recovers
- **WHEN** a source's most recent run fetched more than 0 items after a prior streak of zero-fetch runs
- **THEN** the endpoint reports that source with `zero_streak: 0` and `alert: false`

#### Scenario: Non-admin denied
- **WHEN** a non-admin user calls `GET /news-items/ingestion-runs`
- **THEN** the request is rejected with the standard authorization error

#### Scenario: Limit is bounded
- **WHEN** a caller requests `?limit=500`
- **THEN** the endpoint returns at most 100 runs
