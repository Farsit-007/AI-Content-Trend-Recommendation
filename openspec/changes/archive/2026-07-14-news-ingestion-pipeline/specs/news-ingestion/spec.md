## ADDED Requirements

### Requirement: Source Adapters
The system SHALL fetch candidate news items from HackerNews, Dev.to, GitHub Trending, Reddit, and a configurable list of RSS feeds, normalizing each source's raw response into a common shape (`source`, `source_id`, `title`, `url`, `snippet`, `published_at`, raw engagement fields) before further processing.

#### Scenario: A source adapter fails without aborting the run
- **WHEN** one source (e.g. GitHub Trending) throws or returns an unparseable response during a pipeline run
- **THEN** the pipeline logs the failure, treats that source as contributing zero items, and continues fetching and processing the remaining sources

#### Scenario: RSS items without engagement data are still normalized
- **WHEN** an RSS feed item has no upvote/comment/star equivalent
- **THEN** the normalized item's raw engagement fields default to zero rather than causing a normalization failure

### Requirement: Deduplication by Content Hash
The system SHALL compute a deterministic `content_hash` for every normalized item from its source and URL, and SHALL discard any item whose hash already exists in `NewsItem` or has already appeared earlier in the same run, before that item is scored or stored.

#### Scenario: Previously ingested item reappears in a later run
- **WHEN** a source returns an item whose `content_hash` already exists in the `news_items` collection
- **THEN** the pipeline discards it in the dedupe layer and does not call the embedding or LLM APIs for it

#### Scenario: Same URL returned by two sources in one run
- **WHEN** two different source adapters return items that normalize to the same `content_hash` within a single pipeline run
- **THEN** only the first occurrence proceeds to scoring; the second is discarded as an in-run duplicate

### Requirement: Freshness Filtering
The system SHALL discard normalized items older than a configurable maximum age (`NEWS_INGESTION_MAX_AGE_HOURS`) before scoring, except where a reliable `published_at` cannot be determined for that source, in which case the item SHALL be treated as fresh.

#### Scenario: Stale item is filtered before scoring
- **WHEN** a normalized item's `published_at` is older than `NEWS_INGESTION_MAX_AGE_HOURS` before the current time
- **THEN** the pipeline discards it before generating an embedding or calling the LLM

### Requirement: Relevance Scoring Against Pooled Brand Voice
The system SHALL score each surviving item's `relevance_score` (0–10) as the maximum cosine similarity between the item's embedding and the embedding of every `BrandVoiceExample` document across all teams, scaled to 0–10. When no `BrandVoiceExample` documents exist, the system SHALL skip relevance filtering for that run rather than discarding every item.

#### Scenario: Item scores below the relevance threshold
- **WHEN** a `BrandVoiceExample` pool exists and an item's computed `relevance_score` is below `NEWS_INGESTION_MIN_RELEVANCE`
- **THEN** the pipeline discards the item and does not store it as a `NewsItem`

#### Scenario: Cold start with no brand voice examples
- **WHEN** the `BrandVoiceExample` collection is empty at the start of a pipeline run
- **THEN** every surviving item passes the relevance layer with `relevance_score` left unset, instead of all items being discarded

### Requirement: Trend Scoring From Engagement
The system SHALL compute each item's `trend_score` (0–10) deterministically from its normalized raw engagement fields (points, comments, stars delta), using a logarithmic scale so that sources with very different raw engagement magnitudes are comparable.

#### Scenario: High-engagement item scores near the top of the range
- **WHEN** an item has very high raw points/comments/stars relative to typical items
- **THEN** its computed `trend_score` is close to but does not exceed 10

### Requirement: Categorization and Opportunity Scoring
The system SHALL assign each item surviving the relevance and freshness layers a `category` (one of `AI`, `Web Dev`, `Career`, `Security`, `DevOps`, `Other`), an `impact_note`, and an `opportunity_score` (0–10) via a batched LLM call that considers the item's content, `relevance_score`, and `trend_score`. If the LLM response omits or malforms the result for a given item, the system SHALL fall back to `category: 'Other'` and a derived `opportunity_score` rather than failing the run.

#### Scenario: LLM batch succeeds for all items
- **WHEN** a batch of surviving items is sent to the LLM for categorization
- **THEN** each item is stored with the returned `category`, `impact_note`, and `opportunity_score`, and `processed` is set to `true`

#### Scenario: LLM response is missing or malformed for one item in a batch
- **WHEN** the LLM's JSON response omits an item from the batch or returns invalid data for it
- **THEN** that item is still stored, with `category` defaulted to `'Other'` and `opportunity_score` derived from its existing `relevance_score`/`trend_score`, and the run continues without throwing

### Requirement: Manual Ingestion Trigger
The system SHALL expose `POST /news-items/ingest`, restricted to admin users, which runs the full ingestion pipeline synchronously and returns a per-source summary of items fetched, deduplicated, discarded, and stored.

#### Scenario: Admin triggers ingestion
- **WHEN** an authenticated admin user calls `POST /news-items/ingest`
- **THEN** the pipeline runs to completion and the response body includes fetched/deduped/discarded/stored counts for each source

#### Scenario: Non-admin attempts to trigger ingestion
- **WHEN** an authenticated non-admin user calls `POST /news-items/ingest`
- **THEN** the request is rejected before the pipeline runs

### Requirement: Scheduled Ingestion
The system SHALL run the same ingestion pipeline automatically on a configurable cron schedule (`NEWS_INGESTION_CRON`), independent of any manual trigger, without requiring a separate worker process.

#### Scenario: Scheduled run executes without a manual trigger
- **WHEN** the configured cron schedule fires
- **THEN** the pipeline runs using the same logic as the manual endpoint, and its summary is logged rather than returned over HTTP
