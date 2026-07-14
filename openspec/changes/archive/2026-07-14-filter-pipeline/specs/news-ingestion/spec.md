## MODIFIED Requirements

### Requirement: Deduplication by Content Hash and Semantic Similarity
The system SHALL compute a deterministic `content_hash` for every normalized item from its source and URL, and SHALL discard any item whose hash already exists in `NewsItem` or has already appeared earlier in the same run, before that item is scored or stored. After hash-based dedup, the system SHALL additionally discard any surviving item whose embedding has a cosine similarity of `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` or higher against either (a) an embedding from a `NewsItem` stored within the current freshness window, or (b) the embedding of another item already accepted from the same run, so that the same story appearing under different URLs across sources is not stored more than once.

#### Scenario: Previously ingested item reappears in a later run
- **WHEN** a source returns an item whose `content_hash` already exists in the `news_items` collection
- **THEN** the pipeline discards it in the dedupe layer and does not call the embedding or LLM APIs for it

#### Scenario: Same URL returned by two sources in one run
- **WHEN** two different source adapters return items that normalize to the same `content_hash` within a single pipeline run
- **THEN** only the first occurrence proceeds to scoring; the second is discarded as an in-run duplicate

#### Scenario: Same story from two sources under different URLs
- **WHEN** two normalized items from different sources have different `content_hash` values but their embeddings have cosine similarity at or above `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD`
- **THEN** the pipeline keeps only the item with higher combined raw engagement (points + comments + stars delta) and discards the other before relevance/trend scoring

#### Scenario: Item duplicates a recently-stored item
- **WHEN** a normalized item's embedding has cosine similarity at or above `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` against a `NewsItem` already stored within the current freshness window
- **THEN** the pipeline discards the new item and does not store it, regardless of its own engagement numbers

#### Scenario: Distinct stories with unrelated topics are not merged
- **WHEN** two normalized items' embeddings have cosine similarity below `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD`
- **THEN** both items proceed independently to relevance/trend scoring
