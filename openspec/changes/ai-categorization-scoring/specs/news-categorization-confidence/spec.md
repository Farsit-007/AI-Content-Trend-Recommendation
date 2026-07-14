## ADDED Requirements

### Requirement: Categorization LLM call returns a confidence value
The news ingestion categorization step SHALL request a `confidence` value (0-1) from the LLM alongside `category` for every item, in the same batched call already used for categorization.

#### Scenario: LLM returns a valid confidence
- **WHEN** the categorization LLM call returns a parseable response with `confidence` as a number between 0 and 1 for an item
- **THEN** that item's `category_confidence` is set to the returned value

#### Scenario: LLM response is missing or invalid confidence
- **WHEN** the categorization LLM call returns a response where `confidence` is missing, non-numeric, or outside the 0-1 range for an item
- **THEN** that item falls back to `category_confidence: 0`, consistent with the pipeline's existing fallback-on-parse-failure behavior

### Requirement: Low-confidence items are flagged for review
Every `NewsItem` SHALL be stored with a `needs_review` boolean, set to `true` when `category_confidence` is below `config.news_ingestion.category_confidence_threshold`, and `false` otherwise.

#### Scenario: Confidence below threshold
- **WHEN** an item's `category_confidence` is less than the configured threshold
- **THEN** the stored `NewsItem` has `needs_review: true`

#### Scenario: Confidence at or above threshold
- **WHEN** an item's `category_confidence` is greater than or equal to the configured threshold
- **THEN** the stored `NewsItem` has `needs_review: false`

### Requirement: Feed surfaces the review flag
The Feed UI SHALL visibly indicate when a displayed news item has `needs_review: true`, distinct from the existing "Trending"/"High opportunity" badges.

#### Scenario: Item flagged for review is displayed
- **WHEN** a news item with `needs_review: true` is rendered in the Feed
- **THEN** the card shows a "Needs review" indicator in addition to its category badge
