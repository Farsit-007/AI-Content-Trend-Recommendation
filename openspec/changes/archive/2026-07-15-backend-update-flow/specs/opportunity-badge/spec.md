## ADDED Requirements

### Requirement: News items can be annotated with high_opportunity flag per team
The system SHALL accept an optional `team_id` query parameter on `GET /news-items`. When provided, each news item in the response SHALL include a `high_opportunity: boolean` field computed via `computeAudienceMatch` against the team's recent post embeddings.

#### Scenario: Request with team_id
- **WHEN** a client sends `GET /news-items?team_id=<id>`
- **THEN** each news item in the response includes `high_opportunity: true` if its audience match score exceeds the threshold, `false` otherwise

#### Scenario: Request without team_id
- **WHEN** a client sends `GET /news-items` with no `team_id`
- **THEN** the response is unchanged — no `high_opportunity` field is included

### Requirement: high_opportunity falls back to global threshold when team has no embeddings
When a `team_id` is provided but the team has no `platform_posts` with embeddings, the system SHALL fall back to flagging items where `opportunity_score >= 7.5` as `high_opportunity: true`.

#### Scenario: Team has no post embeddings
- **WHEN** `GET /news-items?team_id=<id>` is requested and the team has no embedded posts
- **THEN** `high_opportunity` is set based on `opportunity_score >= 7.5` for each item

### Requirement: Audience match scores are cached per team
The system SHALL cache the team's aggregated post embeddings used for audience match scoring in Redis at key `team_embeddings:{team_id}` with a 6-hour TTL, to avoid reloading them on every news feed request.

#### Scenario: Embeddings cache hit
- **WHEN** `GET /news-items?team_id=<id>` is called and `team_embeddings:{team_id}` exists in Redis
- **THEN** the cached embeddings are used without querying MongoDB

#### Scenario: Embeddings cache miss
- **WHEN** `GET /news-items?team_id=<id>` is called and no cache entry exists
- **THEN** the system loads post embeddings from `platform_posts`, stores them in Redis with 6h TTL, and uses them for scoring
