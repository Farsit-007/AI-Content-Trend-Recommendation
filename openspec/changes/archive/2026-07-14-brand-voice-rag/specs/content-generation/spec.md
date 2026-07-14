## ADDED Requirements

### Requirement: Generate multi-format content from a topic
The system SHALL provide `POST /content/generate`, accepting `{ team_id: string, topic: string, news_item_id?: string }`, and SHALL return a JSON object containing `topic`, `facebook_post`, `facebook_reel_script`, `linkedin_post`, `youtube_idea` (`{ title, hook, chapters: string[], thumbnail_concept }`), and `caption`.

#### Scenario: Successful generation with a plain topic
- **WHEN** an authenticated user belonging to `team_id` submits `{ team_id, topic }` with no `news_item_id`
- **THEN** the system embeds the topic, retrieves the team's few-shot examples, calls the content LLM once, and returns all five formats populated with non-empty content

#### Scenario: Missing or invalid required fields
- **WHEN** the request omits `team_id` or `topic`, or `topic` is empty
- **THEN** the system responds with a validation error and does not call the LLM

### Requirement: Team-scoped access control
The system SHALL only allow a request to generate content for a `team_id` if the requesting user's `role` is `admin` or `team_id` is in the requesting user's `team_ids`, matching the team-access pattern used by `BrandVoiceExample`.

#### Scenario: Non-admin user requests generation for their own team
- **WHEN** a non-admin user whose `team_ids` includes `team_id` submits a generate request for that `team_id`
- **THEN** the system proceeds with generation

#### Scenario: Non-admin user requests generation for a team they don't belong to
- **WHEN** a non-admin user whose `team_ids` does not include `team_id` submits a generate request for that `team_id`
- **THEN** the system responds with a 403 Forbidden error and does not call the LLM

### Requirement: Team-scoped brand-voice retrieval
The system SHALL retrieve few-shot grounding examples only from `BrandVoiceExample` and `PlatformPost` documents belonging to the request's `team_id`, ranked by cosine similarity between the topic's embedding and each document's stored `embedding`.

#### Scenario: Retrieval never crosses team boundaries
- **WHEN** generating content for `team_id = A`, and `team_id = B` has its own `BrandVoiceExample` and `PlatformPost` documents
- **THEN** none of team B's documents appear among the retrieved few-shot examples for team A's request

#### Scenario: Top-N brand-voice examples selected by similarity
- **WHEN** team A has more than 3 `BrandVoiceExample` documents
- **THEN** the system selects at most the 3 most similar to the topic embedding as few-shot examples

### Requirement: Top-performer pre-filter for PlatformPost retrieval
The system SHALL rank a team's `PlatformPost` documents by an engagement score (`reach + likes*2 + comments*3 + shares*4`), take the top 20, then rank those by cosine similarity to the topic embedding, and select at most the top 3 as few-shot examples.

#### Scenario: High-engagement but off-topic post is excluded
- **WHEN** a team's highest-engagement post has near-zero similarity to the topic, and other lower-engagement posts (still within the top 20 by engagement) are highly similar
- **THEN** the highly-similar posts are selected over the highest-engagement-but-off-topic post

#### Scenario: Fewer than 20 posts exist
- **WHEN** a team has fewer than 20 `PlatformPost` documents
- **THEN** the system ranks all of them by similarity and selects at most the top 3

### Requirement: Cold-start fallback when no brand-voice examples exist
The system SHALL skip all few-shot retrieval (both `BrandVoiceExample` and `PlatformPost`) and generate using a generic, brand-neutral system prompt when the requesting team has zero `BrandVoiceExample` documents.

#### Scenario: Brand-new team with no submitted examples
- **WHEN** `team_id` has zero `BrandVoiceExample` documents, regardless of how many `PlatformPost` documents it has
- **THEN** the system generates content without any few-shot examples from either source, using the generic system prompt

#### Scenario: Team with at least one brand-voice example
- **WHEN** `team_id` has one or more `BrandVoiceExample` documents
- **THEN** the system performs retrieval from both `BrandVoiceExample` and `PlatformPost` as normal (each source independently empty-safe)

### Requirement: Optional news item linking
The system SHALL accept an optional `news_item_id`. When provided and the referenced `NewsItem` exists, the system SHALL reuse its stored `embedding` for retrieval instead of embedding the topic text, and SHALL include its `category` and `impact_note` (when present) as additional context in the generation prompt. When `news_item_id` is omitted, invalid, or does not resolve to an existing `NewsItem`, the system SHALL proceed using the topic text's own embedding without treating this as a request error.

#### Scenario: Valid news_item_id supplied
- **WHEN** a request includes `news_item_id` referencing an existing `NewsItem`
- **THEN** the system uses that item's embedding for retrieval and folds its `category`/`impact_note` into the prompt, and the response's `topic` field still reflects the request's `topic` string

#### Scenario: news_item_id does not resolve
- **WHEN** a request includes `news_item_id` that does not match any `NewsItem`
- **THEN** the system logs the miss, embeds the `topic` text itself, and generates content normally rather than returning an error

### Requirement: Single structured generation call with strict validation
The system SHALL request all five output formats from one LLM call using the content model tier, parse the response as strict JSON, and SHALL return an error response (not partial or fabricated content) if the response is not valid JSON or is missing any required field.

#### Scenario: LLM returns valid structured JSON
- **WHEN** the content LLM responds with valid JSON containing all required fields
- **THEN** the system returns a 200 response with all five formats populated from that JSON

#### Scenario: LLM returns malformed JSON
- **WHEN** the content LLM's response cannot be parsed as JSON, or is missing one or more required fields
- **THEN** the system returns an error response indicating generation failed, and does not return partial or placeholder content
