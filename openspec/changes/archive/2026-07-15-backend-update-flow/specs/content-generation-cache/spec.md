## ADDED Requirements

### Requirement: Generated content is cached in Redis for 24 hours
The system SHALL cache the result of each content generation LLM call in Redis at key `content:{team_id}:{news_item_id}` (or `content:{team_id}:{sha256(topic)}` for free-text topics) with a 24-hour TTL. On cache hit, the cached result SHALL be returned without calling the LLM.

#### Scenario: Cache miss — first generation
- **WHEN** `POST /content/generate` is called and no cached result exists for the key
- **THEN** the system calls the LLM, stores the result in Redis with 24h TTL, and returns it

#### Scenario: Cache hit — subsequent generation
- **WHEN** `POST /content/generate` is called and a cached result exists for the key
- **THEN** the system returns the cached result immediately without calling the LLM

#### Scenario: Cache key collision avoided for free-text topics
- **WHEN** the request includes a free-text topic instead of a `news_item_id`
- **THEN** the cache key uses `sha256(topic)` as the item segment, producing a stable unique key per topic string

### Requirement: Content cache does not affect error responses
The system SHALL only cache successful LLM responses. Errors SHALL not be cached.

#### Scenario: LLM returns an error
- **WHEN** the LLM call fails during content generation
- **THEN** the error is returned to the caller and nothing is written to Redis
