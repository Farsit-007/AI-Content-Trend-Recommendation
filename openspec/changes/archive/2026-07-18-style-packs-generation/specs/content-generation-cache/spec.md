## MODIFIED Requirements

### Requirement: Generated content is cached in Redis for 24 hours
The system SHALL cache the result of each content generation LLM call in Redis at key `content:{team_id}:{news_item_id}:{resolved_language}:{resolved_style_pack_id_or_none}` (or `content:{team_id}:{sha256(topic)}:{resolved_language}:{resolved_style_pack_id_or_none}` for free-text topics) with a 24-hour TTL, where `resolved_language` and `resolved_style_pack_id_or_none` are computed after language and style-pack resolution (not the raw, possibly-absent request fields). On cache hit, the cached result SHALL be returned without calling the LLM.

#### Scenario: Cache miss — first generation
- **WHEN** `POST /content/generate` is called and no cached result exists for the key
- **THEN** the system calls the LLM, stores the result in Redis with 24h TTL, and returns it

#### Scenario: Cache hit — subsequent generation
- **WHEN** `POST /content/generate` is called and a cached result exists for the key
- **THEN** the system returns the cached result immediately without calling the LLM

#### Scenario: Cache key collision avoided for free-text topics
- **WHEN** the request includes a free-text topic instead of a `news_item_id`
- **THEN** the cache key uses `sha256(topic)` as the item segment, producing a stable unique key per topic string

#### Scenario: Language change bypasses stale cache
- **WHEN** a Bangla generation is cached and the same team+item is requested with `language: 'english'`
- **THEN** a fresh LLM call occurs and English output is returned, not the cached Bangla result

#### Scenario: Style pack change bypasses stale cache
- **WHEN** a generation with no style pack is cached and the same team+item is requested with `style_pack_id` set
- **THEN** a fresh LLM call occurs and the styled result is returned, not the cached unstyled result
