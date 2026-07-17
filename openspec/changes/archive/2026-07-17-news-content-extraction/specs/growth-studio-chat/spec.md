## MODIFIED Requirements

### Requirement: News-aware retrieval
The system SHALL retrieve relevant `NewsItem` context when the question concerns trends, news, or "what to post/create", ranking candidates by a combination of `trend_score`/`opportunity_score` and embedding similarity to the question. When a candidate news item has stored `content`, the context passed to the LLM SHALL include a short excerpt of it alongside the item's title, category, snippet, and impact note.

#### Scenario: Trend question surfaces top news
- **WHEN** the message contains trend/news-related language (e.g., mentions "trending", "news", a known category, or a platform-agnostic "what should I post" phrasing)
- **THEN** the system embeds the question, selects a candidate pool of top-scoring `NewsItem` documents, ranks them by similarity to the question embedding, and includes the top results as context passed to the LLM

#### Scenario: Content excerpt included when available
- **WHEN** a retrieved news item has non-empty stored `content`
- **THEN** the context block for that item includes a short excerpt of its content in addition to its title, category, snippet, and impact note

#### Scenario: Content-less item unaffected
- **WHEN** a retrieved news item has no stored `content`
- **THEN** its context block is rendered exactly as before this change
