## ADDED Requirements

### Requirement: Optional Topic-Summary Embedding Strategy for Style Examples
When `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` is enabled, creating a style example (single add or bulk
import) SHALL extract a short English topic summary of the example's content via an LLM call and
compute its stored embedding from that summary rather than the raw content, persisting the summary
alongside an `embedding_source` marker (`'content'` or `'topic_summary'`) recording which strategy
produced the embedding. When the flag is disabled (the default), example creation SHALL be
unaffected and every example SHALL be embedded from its raw content, as today. A summary-extraction
failure SHALL NOT fail example creation — the example SHALL be created with a content-derived
embedding and marked accordingly.

#### Scenario: Flag disabled is unchanged from today
- **WHEN** `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` is false and an example is created
- **THEN** the stored embedding is computed from the raw content, and `embedding_source` is `'content'`

#### Scenario: Flag enabled embeds the extracted summary
- **WHEN** the flag is true and summary extraction succeeds for a new example
- **THEN** the stored embedding is computed from the extracted summary, the summary is persisted as `topic_summary`, and `embedding_source` is `'topic_summary'`

#### Scenario: Extraction failure soft-fails to content embedding
- **WHEN** the flag is true but summary extraction fails or returns an empty result
- **THEN** the example is still created successfully, embedded from its raw content, and marked `embedding_source: 'content'`

#### Scenario: Bulk import applies the same strategy per surviving item
- **WHEN** the flag is true and a bulk-import batch is processed
- **THEN** each created example independently reflects the extraction outcome for its own content, with no single item's extraction failure affecting any other item in the batch

### Requirement: Idempotent Style-Example Embedding Migration
The system SHALL provide a script that re-embeds a style pack's existing examples using the
topic-summary strategy, processing only examples not already marked `embedding_source: 'topic_summary'`,
so repeated runs are safe and only advance previously-unmigrated or previously-failed rows.

#### Scenario: Re-running the migration only processes remaining rows
- **WHEN** the migration script is run twice in succession against the same pack with no new examples added between runs
- **THEN** the second run re-embeds none of the examples the first run successfully migrated

#### Scenario: A migration-time extraction failure leaves the row usable
- **WHEN** an example's summary extraction fails during migration
- **THEN** the example's existing content-derived embedding and `embedding_source: 'content'` marker are left unchanged, and the example remains fully usable in retrieval
