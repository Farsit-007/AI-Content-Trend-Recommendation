# chat-context-retrieval

## ADDED Requirements

### Requirement: Chat context ranking is not pre-filtered by trend score
Chat's news-context retrieval SHALL rank candidate items by semantic similarity to the question
across all active, recently-ingested items (not a trend-score-limited subset) before selecting the
top results to include as context.

#### Scenario: Topically relevant but low-trend-score item exists
- **WHEN** an active news item closely matches the question's topic but ranks outside the top 30
  items by `current_trend_score`
- **THEN** that item is still eligible to be selected as context based on its semantic similarity

#### Scenario: Archived items are excluded regardless of similarity
- **WHEN** an item has `lifecycle: 'archived'`
- **THEN** it is not included in the candidate pool for chat context

### Requirement: Retrieval quality is logged for every chat request
Every chat request SHALL log the retrieval outcome (top similarity score, candidate pool size,
number of context items returned) so a low-context answer can be distinguished from a
model-ignoring-good-context answer after the fact.

#### Scenario: No relevant context found
- **WHEN** the best-matching candidate's similarity is below a documented low-relevance threshold
- **THEN** the log entry for that request records the top similarity score and context count so it
  is queryable later

### Requirement: Source coverage for major AI/tech releases is documented
The set of active ingestion adapters/feeds SHALL be reviewed and the finding (which sources would
plausibly surface a named AI-model or major tech release, and which gaps remain) recorded in the
repository.

#### Scenario: Coverage audit exists
- **WHEN** someone asks "would we ingest a story like X" for a plausible major AI/tech release
- **THEN** a written audit answers which adapter(s) would cover it and names any known gap
