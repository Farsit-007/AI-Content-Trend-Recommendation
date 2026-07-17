## MODIFIED Requirements

### Requirement: News-Item-Grounded Content Generation
When `POST /content/generate` is called with a `news_item_id` that resolves to
a stored `NewsItem`, the system SHALL pass the item's `snippet` and `url` to
the generation LLM alongside its existing `category` and `impact_note`
context, so generated content is grounded in the item's actual stored source
text rather than its title alone. The system prompt SHALL instruct the model
to ground factual claims in the provided snippet and not invent specific
facts, numbers, quotes, or dates beyond what is given, writing more generally
when the available snippet is thin rather than fabricating specifics. A
missing or invalid `news_item_id` SHALL continue to fall back to embedding the
raw `topic` text with no news-item context, unchanged from current behavior.

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
