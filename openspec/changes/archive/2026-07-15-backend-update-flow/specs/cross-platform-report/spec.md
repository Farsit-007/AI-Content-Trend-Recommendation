## ADDED Requirements

### Requirement: Report endpoint returns 30-day cross-platform performance
The system SHALL expose `GET /reports?team_id=<id>` that returns a complete cross-platform performance report for the requested team, including a 30-day overview, per-platform breakdown, top-5 opportunity news items, and a Banglish AI narrative insight. Response time SHALL be under 15 seconds cold.

#### Scenario: Report requested with warm cache
- **WHEN** a team member sends `GET /reports?team_id=<id>` and the cache key `report:{team_id}` exists in Redis
- **THEN** the system returns the cached report with HTTP 200 in under 50ms

#### Scenario: Report requested with cold cache
- **WHEN** a team member sends `GET /reports?team_id=<id>` and no cache exists
- **THEN** the system aggregates data, calls the LLM once, caches the result for 6 hours, and returns HTTP 200 in under 15 seconds

#### Scenario: Non-member attempts to read another team's report
- **WHEN** a user requests a report for a team they are not a member of
- **THEN** the system returns HTTP 403

### Requirement: Report includes 30-day overview with delta
The system SHALL compute a 30-day overview from `platform_posts` including total reach, engagements, views, and engagement rate, with delta values compared to the prior 30-day window.

#### Scenario: Overview computed from posts
- **WHEN** the report is generated
- **THEN** the overview object contains `{ reach, engagements, views, engagement_rate, delta: { reach, engagements, views, engagement_rate } }` where delta values are percentage change vs prior 30 days

### Requirement: Report includes per-platform breakdown
The system SHALL include a breakdown section derived from `platform_analytics` rollups, one entry per enabled platform with its status, stats, top posts, and best posting times.

#### Scenario: Platform with data
- **WHEN** a platform has `status: 'ok'` rollup data
- **THEN** its breakdown includes reach, engagements, top_posts array, and best_times array

#### Scenario: Platform not connected
- **WHEN** a platform has `status: 'not_connected'` or `'pending_approval'`
- **THEN** its breakdown entry includes the status and null/empty stats fields

### Requirement: Report includes top-5 opportunity news items
The system SHALL compute an opportunity ranking by scoring recent news items using `computeAudienceMatch(newsEmbedding, teamPostEmbeddings[])` — cosine similarity weighted by post engagement — and return the top 5 with a suggested platform and content format.

#### Scenario: Opportunities computed
- **WHEN** the report is generated and the team has platform post embeddings
- **THEN** the opportunities array contains up to 5 items, each with `news_item_id`, `title`, `audience_match_score`, `suggested_platform`, and `suggested_format`

#### Scenario: Team has no post embeddings
- **WHEN** the team has no `platform_posts` with embeddings
- **THEN** opportunities are ranked by raw `trend_score` alone and `audience_match_score` is null

### Requirement: Report includes Banglish AI narrative insight
The system SHALL make exactly one LLM call per report generation to produce a Banglish narrative insight summarizing performance trends. All numbers SHALL be precomputed before the LLM call; the LLM writes narrative only.

#### Scenario: LLM call succeeds
- **WHEN** the report is generated and the LLM responds within timeout
- **THEN** `ai_insight` contains a non-empty Banglish narrative string

#### Scenario: LLM call fails or times out
- **WHEN** the LLM call throws an error or exceeds timeout
- **THEN** the system sets `ai_insight: null` and returns HTTP 200 with the rest of the report intact (no 502)

### Requirement: Admin can bypass report cache
The system SHALL accept `GET /reports?team_id=<id>&refresh=true` for admin users only, which skips the Redis cache, recomputes the report, and stores the fresh result.

#### Scenario: Admin requests cache refresh
- **WHEN** an admin sends `GET /reports?team_id=<id>&refresh=true`
- **THEN** the system ignores any existing cache entry, recomputes the full report, and caches the new result

#### Scenario: Non-admin requests cache refresh
- **WHEN** a non-admin sends `GET /reports?team_id=<id>&refresh=true`
- **THEN** the `refresh` param is ignored and the cached result is returned normally
