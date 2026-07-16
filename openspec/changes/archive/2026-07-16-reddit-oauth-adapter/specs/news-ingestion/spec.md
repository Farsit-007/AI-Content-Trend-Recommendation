## MODIFIED Requirements

### Requirement: Source Adapters
The system SHALL fetch candidate news items from HackerNews, Dev.to, GitHub Trending, Reddit, and a configurable list of RSS feeds, normalizing each source's raw response into a common shape (`source`, `source_id`, `title`, `url`, `snippet`, `published_at`, raw engagement fields) before further processing. The RSS adapter SHALL label each normalized item with a per-feed source label of the form `rss:<hostname>`, where `<hostname>` is derived from the feed URL, lowercased, with any leading `www.` stripped, falling back to the flat label `rss` only when the feed URL cannot be parsed. The Reddit adapter SHALL authenticate with Reddit via the OAuth2 client-credentials grant using `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, caching the resulting bearer token until shortly before its expiry, and SHALL fetch each configured subreddit's daily top listing from `oauth.reddit.com` with that token and a Reddit-compliant User-Agent. When Reddit credentials are not configured, the Reddit adapter SHALL return no items without making any network call, and the server SHALL boot normally regardless of whether they are set. Each adapter SHALL tolerate the failure of an individual upstream resource (one feed, one subreddit) by logging it and returning the items successfully fetched from the remaining resources.

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

#### Scenario: Reddit fetches successfully with valid credentials
- **WHEN** the Reddit adapter runs with valid `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`
- **THEN** it obtains (or reuses a cached) bearer token, fetches each configured subreddit's daily top listing from `oauth.reddit.com`, and returns normalized items — not an HTTP 403

#### Scenario: Reddit token is cached across runs
- **WHEN** a second pipeline run starts before the previously-obtained token has expired
- **THEN** the adapter reuses the cached token rather than calling the token endpoint again

#### Scenario: Reddit token expired or was revoked
- **WHEN** a Reddit listing request returns HTTP 401
- **THEN** the adapter invalidates the cached token, obtains a fresh one, and retries the request exactly once

#### Scenario: Reddit credentials are not configured
- **WHEN** `REDDIT_CLIENT_ID` or `REDDIT_CLIENT_SECRET` is unset
- **THEN** the Reddit adapter makes no network request, returns zero items, and the run records a "not configured" reason for that source rather than a network error

#### Scenario: One subreddit fails while others succeed
- **WHEN** one configured subreddit's listing request fails
- **THEN** the adapter logs that subreddit's failure and still returns items from the remaining configured subreddits
