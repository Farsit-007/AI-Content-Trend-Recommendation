## ADDED Requirements

### Requirement: Linked-Page Content Enrichment
For stored-bound news items that lack API-provided content after the earlier `news-full-content-sources` enrichment, the pipeline SHALL attempt to obtain full text after relevance filtering and before categorization: dev.to items via the article-by-id API, GitHub Trending items via the repository README API, and all other items via readable-article extraction of the linked page, subject to a request timeout, an HTML content-type check, a response-size limit, and bounded concurrency. Extraction failure SHALL mark the item `content_status: 'failed'` without dropping, delaying beyond the bounded attempt, or otherwise altering the item. Items that already carry content SHALL be skipped by this layer untouched. The enrichment layer SHALL be disableable via `NEWS_CONTENT_FETCH_ENABLED` and SHALL record per-source fetched/failed counts in the persisted ingestion run.

#### Scenario: HN link post gets article text
- **WHEN** a Hacker News link post pointing at an extractable article survives relevance filtering
- **THEN** the stored item's `content` holds the extracted plain article text with `content_status: 'full'` (or `'partial'` if capped)

#### Scenario: dev.to full body via API
- **WHEN** a dev.to item (which carries only a description snippet at fetch time) reaches enrichment
- **THEN** its `content` is the `body_markdown` of `GET /api/articles/{id}`, not a page scrape

#### Scenario: GitHub Trending README via API
- **WHEN** a GitHub Trending item reaches enrichment
- **THEN** its `content` is the repository's README text fetched via the GitHub REST API, not a page scrape of the GitHub web UI

#### Scenario: Already-enriched item is skipped
- **WHEN** an item already carries non-empty `content` from an earlier enrichment path
- **THEN** the linked-page enrichment layer makes no network request for that item and leaves it unchanged

#### Scenario: Paywalled or JS-only page fails soft
- **WHEN** the linked page times out, returns non-HTML, exceeds the size limit, returns a non-2xx status, or yields no extractable text
- **THEN** the item is stored anyway with `content_status: 'failed'` and the run continues

#### Scenario: Kill switch
- **WHEN** `NEWS_CONTENT_FETCH_ENABLED=false`
- **THEN** the pipeline stores items exactly as the prior change left them, with zero enrichment HTTP requests

#### Scenario: Enrichment failure does not abort the run
- **WHEN** the enrichment layer itself throws unexpectedly
- **THEN** the run logs the failure and completes using unenriched items, rather than aborting

#### Scenario: Run counts capture enrichment health
- **WHEN** an ingestion run performs enrichment
- **THEN** the persisted `IngestionRun` per-source counts include `content_fetched` and `content_failed`

## MODIFIED Requirements

### Requirement: Categorization Uses Available Content
The categorization prompt SHALL include, per item, the first 500 characters of stored `content` when present, in addition to the title and snippet, leaving the response contract, batching, and fallback behavior unchanged.

#### Scenario: Content lead in categorize prompt
- **WHEN** a batch containing an item with content is categorized
- **THEN** the user prompt line for that item contains its content lead, and items without content render exactly as before
