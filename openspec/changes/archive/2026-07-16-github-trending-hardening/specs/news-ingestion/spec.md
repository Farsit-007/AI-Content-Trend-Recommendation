## MODIFIED Requirements

### Requirement: Source Adapters
The system SHALL fetch candidate news items from HackerNews, Dev.to, GitHub Trending, Reddit, and a configurable list of RSS feeds, normalizing each source's raw response into a common shape (`source`, `source_id`, `title`, `url`, `snippet`, `published_at`, raw engagement fields) before further processing. The GitHub Trending source SHALL combine two independent fetch paths — scraping the public trending page and querying the GitHub Search API for repositories created within the pipeline's freshness window, sorted by stars — merged and deduplicated by repository full name, with titles enriched with the repository description when one is available. The GitHub Trending source SHALL report a failure only when the merged result is empty and at least one of its two fetch paths recorded an actual error, not merely because one path returned zero items while the other succeeded. Each adapter SHALL tolerate the failure of an individual upstream resource (one feed, one subreddit, one fetch path) by logging it and returning the items successfully fetched from the remaining resources.

#### Scenario: A source adapter fails without aborting the run
- **WHEN** one source throws or returns an unparseable response during a pipeline run
- **THEN** the pipeline logs the failure, treats that source as contributing zero items, and continues fetching and processing the remaining sources

#### Scenario: RSS items without engagement data are still normalized
- **WHEN** an RSS feed item has no upvote/comment/star equivalent
- **THEN** the normalized item's raw engagement fields default to zero rather than causing a normalization failure

#### Scenario: Total failure across both fetch paths is not silent
- **WHEN** the trending-page scrape errors (a non-OK HTTP response) and the Search API path also errors, so the merged result is empty
- **THEN** the adapter reports an error naming both failures, rather than returning an empty array as if nothing were trending

#### Scenario: A markup change alone does not raise a false alarm while the Search API still delivers
- **WHEN** the trending page returns HTTP 200 but parses to zero repositories (a likely markup change), while the Search API path succeeds with items
- **THEN** the adapter returns the Search API's items, logs the scrape's zero-parse outcome, and does not report the source as failed

#### Scenario: One GitHub Trending fetch path fails, the other delivers
- **WHEN** the trending-page scrape parses to zero repositories but the Search API path returns repositories (or vice versa)
- **THEN** the adapter returns the successful path's items and logs the other path's failure, without reporting the source as failed

#### Scenario: Both fetch paths legitimately find nothing
- **WHEN** the trending-page scrape parses to zero repositories and the Search API path succeeds but returns zero repositories, with neither path erroring
- **THEN** the adapter returns an empty array without reporting the source as failed

#### Scenario: GitHub Trending items from the Search API carry real publication dates
- **WHEN** a repository arrives via the Search API path
- **THEN** its `published_at` is set from the repository's creation date, making it subject to the freshness filter and eligible for the semantic-dedup recent-items pool — unlike scraped items, which carry no `published_at`

#### Scenario: GitHub Trending title is enriched with the repository description
- **WHEN** a repository (from either fetch path) has a description
- **THEN** its normalized item's title is the repository's full name followed by the (possibly truncated) description, and the untruncated description is preserved as the snippet

#### Scenario: The same GitHub repository appears via both fetch paths
- **WHEN** a repository is present in both the trending scrape and the Search API results within the same run
- **THEN** the adapter returns it exactly once
