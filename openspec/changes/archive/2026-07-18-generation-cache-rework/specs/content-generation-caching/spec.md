# content-generation-caching

## ADDED Requirements

### Requirement: Interactive generation is always fresh
`POST /content/generate` SHALL invoke the LLM for every requested format on every request and SHALL
NOT serve any format's output from a response cache. The `regenerate` request field SHALL be
accepted and ignored during the transition period.

#### Scenario: Two identical generate requests produce independent drafts
- **WHEN** the same team submits two consecutive generate requests for the same news item, language,
  style pack, and formats
- **THEN** each request results in its own LLM call per format, and no Redis response-cache key is
  read or written

#### Scenario: Legacy client sends regenerate flag
- **WHEN** a request includes `regenerate: true` or `regenerate: false`
- **THEN** the request validates successfully and behaves identically to a request without the flag

### Requirement: Fact sheets remain cached
Fact-sheet extraction SHALL continue to be cached in Redis with its existing 7-day TTL, keyed by
news item, so repeated generations of the same item do not re-pay the extraction LLM call.

#### Scenario: Second generation of the same item reuses the fact sheet
- **WHEN** a team generates content twice for the same news item with sufficient stored content
- **THEN** the fact-extraction LLM call happens at most once within the cache TTL

### Requirement: Topic embeddings are cached per model
When a generate request has no news-item embedding, the topic text's embedding SHALL be cached in
Redis keyed by the sha256 of the topic text and the resolved embedding model id, with a TTL of 7
days. A change of embedding model SHALL never serve vectors produced by a different model.

#### Scenario: Repeated manual-topic generation
- **WHEN** a team generates twice from the same manual topic within the TTL
- **THEN** the embedding provider is called at most once

#### Scenario: Embedding model changes
- **WHEN** the resolved embedding model differs from the model that produced a cached vector for
  the same topic
- **THEN** the cached vector is not used and a fresh embedding is computed under the new key

### Requirement: Auto-generation idempotency is independent of caching
The scheduled auto-generation job SHALL NOT create a second draft for a team+news-item pair that
already has a persisted draft, regardless of response-cache state, and SHALL remain bounded by
`AUTO_GENERATION_MAX_PER_RUN` LLM-backed drafts per run.

#### Scenario: Job runs twice in a row
- **WHEN** the auto-generation job runs twice consecutively with unchanged news and teams
- **THEN** the second run creates zero new drafts and performs zero content-generation LLM calls
