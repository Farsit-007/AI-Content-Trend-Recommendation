## MODIFIED Requirements

### Requirement: News-Item-Grounded Content Generation
When `POST /content/generate` is called with a `news_item_id` that resolves to a stored `NewsItem`, the system SHALL pass the item's `snippet` and `url` to the generation LLM alongside its existing `category` and `impact_note` context, so generated content is grounded in the item's actual stored source text rather than its title alone. When the resolved item's stored `content` is at least the configured minimum length (`CONTENT_FACTS_MIN_CHARS`, default 800 characters), the system SHALL additionally obtain a fact sheet (a ≤3-sentence summary plus 5-10 short facts) extracted by a cheap model call from the capped content, cache it per news item for reuse across teams, formats, and requests, and include it in every requested format's user prompt as grounding reference. The system's grounding instruction SHALL direct the model to ground claims in the provided snippet and, when present, the provided fact list, not inventing specific facts, numbers, quotes, or dates beyond what is given, writing more generally when the available context is thin rather than fabricating specifics. Fact extraction failure or content below the threshold SHALL leave generation behavior identical to the snippet-only grounded path. A missing or invalid `news_item_id` SHALL continue to fall back to embedding the raw `topic` text with no news-item context, unchanged from current behavior.

#### Scenario: Snippet included in the generation prompt
- **WHEN** `POST /content/generate` is called with a `news_item_id` resolving to a `NewsItem` with a non-empty `snippet`
- **THEN** the LLM request includes that snippet text as reference context, not just the item's title and category

#### Scenario: Anti-hallucination instruction present
- **WHEN** a news item's context (snippet and/or impact_note) is included in the prompt
- **THEN** the system prompt instructs the model not to invent specific facts, numbers, or quotes beyond what is provided

#### Scenario: Snippet-less item still uses available context
- **WHEN** a resolved `NewsItem` has no `snippet` (e.g. categorization fell back and only `category`/`impact_note` are meaningful, or the source never provided one) but does have a `category` or `impact_note`
- **THEN** the existing context (category/impact_note) is still included in the prompt, unaffected by the absence of a snippet

#### Scenario: Invalid news_item_id falls back unchanged
- **WHEN** `news_item_id` is missing or does not resolve to a stored `NewsItem`
- **THEN** the system falls back to embedding the raw `topic` text with no news-item context, exactly as before this change

#### Scenario: Content-rich item generates from facts
- **WHEN** generation runs for an item whose `content` exceeds `CONTENT_FACTS_MIN_CHARS`
- **THEN** one extraction call precedes the format write calls and each requested format's user prompt contains the fact list

#### Scenario: Fact sheet reused across teams and formats
- **WHEN** a second team generates from the same news item within the facts cache's 7-day TTL, or a later request asks for an additional format from the same item
- **THEN** no new extraction call occurs — the cached fact sheet is reused

#### Scenario: Thin content skips extraction
- **WHEN** the resolved item has no `content` or `content` below `CONTENT_FACTS_MIN_CHARS`
- **THEN** no extraction call occurs and prompts match the pre-change (snippet-only) shape

#### Scenario: Extraction failure is soft
- **WHEN** the extraction call returns unparseable or invalid-shape output
- **THEN** generation completes normally without a facts block, logging a warning, using the pre-change snippet-grounded prompt
