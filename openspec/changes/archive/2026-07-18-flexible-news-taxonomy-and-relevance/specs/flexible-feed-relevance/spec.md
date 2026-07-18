## ADDED Requirements

### Requirement: Ingestion stores every deduped, fresh item regardless of relevance score
`runIngestionPipeline` SHALL NOT filter items out of storage based on `relevance_score`. Every item
that survives freshness and dedup filtering SHALL be stored, with `relevance_score` and
`opportunity_score` still computed and persisted for ranking purposes only.

#### Scenario: A low-relevance item relative to the pooled brand-voice examples
- **WHEN** an item's `relevance_score` (against the global brand-voice pool) is below
  `NEWS_INGESTION_MIN_RELEVANCE`
- **THEN** the item is still stored, with its low `relevance_score` intact for downstream
  ranking/opportunity-scoring use, not silently dropped before storage

#### Scenario: Cold start (no brand-voice examples anywhere yet)
- **WHEN** no team anywhere has submitted a brand-voice example
- **THEN** behavior is unchanged from today — every item is stored (this was already true; this
  requirement generalizes it to always be true, not only during cold start)

### Requirement: A team's feed includes items in a subscribed category's broad group, not only exact matches
`GET /news-items` scoped to a ready team SHALL include every item whose category's broad group is in
the team's `subscribed_categories`, in addition to items with an exact category match.

#### Scenario: Team subscribed to a broad group sees fine-grained items under it
- **WHEN** a team subscribes to `"AI"` (a broad group) and an item is categorized as `"LLM Tooling"`
  (a discovered category whose broad group is `"AI"`)
- **THEN** that item appears in the team's feed

#### Scenario: Team subscribed to a specific discovered category
- **WHEN** a team subscribes specifically to `"LLM Tooling"` only (not the broader `"AI"` group)
- **THEN** items categorized exactly as `"LLM Tooling"` appear; items in `"AI"` under a different
  fine-grained category do not, unless a semantic-similarity match also includes them (see below)

### Requirement: A team's feed includes semantically near-relevant items beyond exact/group category match
When the semantic-matching tier is enabled, `GET /news-items` scoped to a ready team SHALL
additionally include items whose semantic similarity to the team's subscribed categories or
brand-voice examples exceeds a configured floor, even when neither their exact category nor broad
group matches the subscription.

#### Scenario: A closely related item under a different category label
- **WHEN** an item's embedding is highly similar to the team's brand-voice examples or to
  representative content in a subscribed category, but its own assigned category doesn't match
  (exactly or by broad group)
- **THEN** it is still eligible to appear in the team's feed, distinguishable in the response from an
  exact/group category match (e.g. via a `match_reason` or similar field) so the frontend can label
  it if desired

#### Scenario: Similarity below the floor
- **WHEN** an item's similarity to the team's subscription signal is below the configured floor and
  neither its category nor broad group matches
- **THEN** it does not appear in that team's feed
