## MODIFIED Requirements

### Requirement: Source Adapters
The system SHALL fetch candidate news items from HackerNews, Dev.to, GitHub Trending, Reddit, and a configurable list of RSS feeds, normalizing each source's raw response into a common shape (`source`, `source_id`, `title`, `url`, `snippet`, `published_at`, raw engagement fields) before further processing. The RSS adapter SHALL label each normalized item with a per-feed source label of the form `rss:<hostname>`, where `<hostname>` is derived from the feed URL, lowercased, with any leading `www.` stripped, falling back to the flat label `rss` only when the feed URL cannot be parsed. Each adapter SHALL tolerate the failure of an individual upstream resource (one feed, one subreddit) by logging it and returning the items successfully fetched from the remaining resources.

#### Scenario: A source adapter fails without aborting the run
- **WHEN** one source (e.g. GitHub Trending) throws or returns an unparseable response during a pipeline run
- **THEN** the pipeline logs the failure, treats that source as contributing zero items, and continues fetching and processing the remaining sources

#### Scenario: RSS items without engagement data are still normalized
- **WHEN** an RSS feed item has no upvote/comment/star equivalent
- **THEN** the normalized item's raw engagement fields default to zero rather than causing a normalization failure

#### Scenario: Two RSS feeds produce separately-labeled items
- **WHEN** the RSS adapter fetches `https://www.techcrunch.com/feed/` and `https://medium.com/feed/tag/programming` in the same run
- **THEN** their normalized items carry `source: "rss:techcrunch.com"` and `source: "rss:medium.com"` respectively

#### Scenario: Unparseable feed URL falls back to the flat label
- **WHEN** the RSS adapter processes a feed whose configured URL cannot be parsed as a URL
- **THEN** items from that feed are labeled `source: "rss"` and the adapter does not throw

#### Scenario: One RSS feed fails while others succeed
- **WHEN** one configured RSS feed request fails during a run
- **THEN** the adapter logs that feed's failure and still returns the normalized items from the remaining feeds

### Requirement: Manual Ingestion Trigger
The system SHALL expose `POST /news-items/ingest`, restricted to admin users, which runs the full ingestion pipeline synchronously and returns a per-source summary of items fetched, deduplicated, discarded, and stored. The summary SHALL contain one entry for every source label emitted by the run's items as well as every configured adapter, so that adapters emitting multiple labels (such as RSS emitting one `rss:<hostname>` label per feed) are reported per label, and adapters that fetched nothing or failed still appear with zero counts.

#### Scenario: Admin triggers ingestion
- **WHEN** an authenticated admin user calls `POST /news-items/ingest`
- **THEN** the pipeline runs to completion and the response body includes fetched/deduped/discarded/stored counts for each source

#### Scenario: Non-admin attempts to trigger ingestion
- **WHEN** an authenticated non-admin user calls `POST /news-items/ingest`
- **THEN** the request is rejected before the pipeline runs

#### Scenario: Summary reports each RSS feed separately
- **WHEN** a run fetches items from three configured RSS feeds on different hosts
- **THEN** the summary contains a separate entry for each `rss:<hostname>` label rather than one aggregated `rss` entry

#### Scenario: Summary covers an adapter that returned nothing
- **WHEN** an adapter throws or returns zero items during a run
- **THEN** the summary still contains an entry for that adapter with zero counts

## ADDED Requirements

### Requirement: Dev.to Fetch Window Matches Freshness Window
The Dev.to adapter SHALL request articles whose age distribution falls inside the `NEWS_INGESTION_MAX_AGE_HOURS` freshness window by querying both the daily top list (`top=1`) and the rising list (`state=rising`), merging the two responses and deduplicating them by article id, so that fetched articles are not discarded wholesale by the freshness filter. The adapter SHALL tolerate the failure of either request individually and SHALL fail only when both requests fail.

#### Scenario: Daily-window articles survive the freshness filter
- **WHEN** the Dev.to adapter runs with `NEWS_INGESTION_MAX_AGE_HOURS` set to 72
- **THEN** it requests `top=1&per_page=50` and `state=rising&per_page=50`, and the articles it returns are recent enough that the freshness filter retains them

#### Scenario: Article returned by both endpoints appears once
- **WHEN** the same article id is present in both the top response and the rising response
- **THEN** the adapter output contains that article exactly once

#### Scenario: One Dev.to endpoint fails
- **WHEN** the `top` request fails but the `state=rising` request succeeds
- **THEN** the adapter logs the failure and returns the rising articles instead of throwing

#### Scenario: Both Dev.to endpoints fail
- **WHEN** both the `top` and `state=rising` requests fail
- **THEN** the adapter throws so that the run records Dev.to as a failed source

### Requirement: Documented Ingestion Environment Variables
Every `NEWS_INGESTION_*` environment variable and `REDDIT_SUBREDDITS` SHALL be documented in `backend/.env.example` with its default value and its effect, and `NEWS_INGESTION_RSS_FEEDS` SHALL ship with a curated starter list that includes Medium tag feeds. Every one of these variables SHALL remain individually optional, such that the server boots successfully when none of them are set.

#### Scenario: Fresh clone boots without ingestion variables
- **WHEN** the backend starts with a `.env` file containing no `NEWS_INGESTION_*` variables
- **THEN** configuration validation passes and the RSS adapter iterates an empty feed list without error

#### Scenario: Operator discovers the RSS feed configuration
- **WHEN** an operator reads `backend/.env.example`
- **THEN** they find `NEWS_INGESTION_RSS_FEEDS` documented with a curated starter list of feed URLs including at least one Medium tag feed

#### Scenario: Medium content reaches the feed via RSS
- **WHEN** the pipeline runs with the curated starter list configured
- **THEN** items originating from Medium tag feeds are normalized under an `rss:medium.com` source label and are eligible for storage
