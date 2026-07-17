## ADDED Requirements

### Requirement: Full Content Captured From Source APIs
The ingestion pipeline SHALL store, for each news item, the fullest text its source API already provides, in a `content` field separate from the short `snippet`, together with `content_status` (`none|partial|full|failed`), `word_count`, and `content_fetched_at`. Content SHALL be plain text (HTML stripped), capped at a configurable maximum (`NEWS_CONTENT_MAX_CHARS`, default 20000) applied at one central point in the pipeline, with `content_status` distinguishing capped (`partial`) from complete (`full`) text. The `snippet` field and the embedding input text SHALL remain byte-identical to their pre-change behavior for every source.

#### Scenario: Reddit self-post stores full text
- **WHEN** a Reddit text post with a 3000-character `selftext` is ingested
- **THEN** `snippet` is the first 500 characters (unchanged) and `content` holds the full 3000 characters with `content_status: 'full'` and a positive `word_count`

#### Scenario: Stack Overflow question body captured
- **WHEN** the Stack Overflow adapter fetches hot questions
- **THEN** the request includes `filter=withbody` and each stored item's `content` is the HTML-stripped question body while `snippet` remains the tag list

#### Scenario: Product Hunt description captured
- **WHEN** the Product Hunt adapter fetches top launches
- **THEN** the GraphQL query requests each post's `description` and the stored item's `content` holds it while `snippet` remains the tagline

#### Scenario: Lobsters full description captured
- **WHEN** a Lobsters story has a description longer than 500 characters
- **THEN** `content` holds the full uncapped description while `snippet` remains capped at 500 characters

#### Scenario: RSS content:encoded captured
- **WHEN** an RSS feed item carries a `content:encoded` body
- **THEN** the stored item's `content` is the stripped text of that body and `snippet` remains rss-parser's `contentSnippet`

#### Scenario: Hacker News text-post story captured
- **WHEN** an Ask/Show HN item with `story_text` is ingested
- **THEN** the stored item's `content` is the stripped `story_text`, matching what `snippet` already derives from

#### Scenario: Oversized content is capped and marked partial
- **WHEN** a source provides text longer than `NEWS_CONTENT_MAX_CHARS`
- **THEN** `content` is truncated to the cap and `content_status` is `'partial'`

#### Scenario: Sources without extra text are unchanged
- **WHEN** an item from a source that provides no fuller text in this change (e.g. Mastodon, dev.to, GitHub Trending, GNews) is ingested
- **THEN** the item stores `content_status: 'none'`, no `content`, and its snippet/embedding behavior is identical to before this change

### Requirement: News API Response Payload Hygiene
The news list endpoint SHALL NOT include `content` or the raw `embedding` vector in its per-item response objects (`high_opportunity` continues to be computed server-side before stripping). The single-item endpoint SHALL include `content` and content metadata but SHALL NOT include `embedding`.

#### Scenario: List response excludes heavy fields
- **WHEN** `GET /news-items` returns items
- **THEN** no returned object contains an `embedding` or `content` key, while `content_status` and `word_count` are present

#### Scenario: Detail response includes content
- **WHEN** `GET /news-items/:id` returns an item that has stored content
- **THEN** the response contains `content` and `content_status` but no `embedding` key

#### Scenario: Detail response omits embedding even without content
- **WHEN** `GET /news-items/:id` returns an item with `content_status: 'none'`
- **THEN** the response still contains no `embedding` key
