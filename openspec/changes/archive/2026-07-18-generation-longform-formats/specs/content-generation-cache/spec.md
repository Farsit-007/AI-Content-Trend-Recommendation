## MODIFIED Requirements

### Requirement: Generated content is cached in Redis for 24 hours
The system SHALL cache the result of each format's content generation LLM call in Redis at key `content:{team_id}:{news_item_id}:{resolved_language}:{resolved_style_pack_id_or_none}:{format}` (or `content:{team_id}:{sha256(topic)}:{resolved_language}:{resolved_style_pack_id_or_none}:{format}` for free-text topics) with a 24-hour TTL, where `resolved_language` and `resolved_style_pack_id_or_none` are computed after language and style-pack resolution and `{format}` is the specific format being generated. Each requested format's cache entry SHALL be read and written independently — a cache hit for one format SHALL NOT require or affect any other requested format's cache state.

#### Scenario: Cache miss — first generation
- **WHEN** `POST /content/generate` is called for a format and no cached result exists for that format's key
- **THEN** the system calls the LLM for that format, stores the result in Redis with 24h TTL, and returns it

#### Scenario: Cache hit — subsequent generation
- **WHEN** `POST /content/generate` is called for a format and a cached result exists for that format's key
- **THEN** the system returns the cached result for that format immediately without calling the LLM for it

#### Scenario: Cache key collision avoided for free-text topics
- **WHEN** the request includes a free-text topic instead of a `news_item_id`
- **THEN** the cache key uses `sha256(topic)` as the item segment, producing a stable unique key per topic string

#### Scenario: Language change bypasses stale cache
- **WHEN** a Bangla generation is cached and the same team+item is requested with `language: 'english'`
- **THEN** a fresh LLM call occurs and English output is returned, not the cached Bangla result

#### Scenario: Style pack change bypasses stale cache
- **WHEN** a generation with no style pack is cached and the same team+item is requested with `style_pack_id` set
- **THEN** a fresh LLM call occurs and the styled result is returned, not the cached unstyled result

#### Scenario: On-demand additional format reuses nothing stale
- **WHEN** `facebook_post` and `linkedin_post` were generated and cached earlier, and a later request for the same team+item+language+pack asks for `caption` only
- **THEN** exactly one LLM call occurs (for `caption`), the response contains only `topic` and `caption`, and the previously-cached `facebook_post`/`linkedin_post` entries are untouched

#### Scenario: Regenerating one format does not require regenerating siblings
- **WHEN** `facebook_post` and `linkedin_post` are both cached and a request asks for both again
- **THEN** both are served from cache with zero LLM calls
