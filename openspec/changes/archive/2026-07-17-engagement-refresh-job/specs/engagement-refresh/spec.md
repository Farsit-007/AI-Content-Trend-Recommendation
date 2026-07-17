## ADDED Requirements

### Requirement: Scheduled Engagement Re-Polling
The system SHALL run a scheduled engagement-refresh job (cron `NEWS_REFRESH_CRON`,
default hourly at minute 30, Redis-locked so concurrent instances no-op) that
re-fetches current engagement for stored news items from sources with a
registered engagement fetcher (initially hackernews, reddit, devto; the
registry is the extension point for future sources), scoped to items created within
`NEWS_REFRESH_WINDOW_HOURS` (default 96) and capped at
`NEWS_REFRESH_MAX_REQUESTS` (default 200) HTTP requests per run, prioritizing
the youngest items. For each refreshed item the system SHALL overwrite the
stored engagement counts, append a timestamped snapshot to `engagement_history`
(bounded to the most recent 32 snapshots), and set `engagement_refreshed_at`.
The ingest-time `trend_score` SHALL remain unchanged by refresh.

#### Scenario: HN item is refreshed
- **WHEN** the refresh job processes a hackernews item whose story now has more points and comments
- **THEN** the item's `engagement.points`/`engagement.comments` reflect the new values and `engagement_history` gained a snapshot with those values and the refresh time

#### Scenario: Reddit items are batch-fetched
- **WHEN** 150 reddit items are in scope
- **THEN** the job issues 2 requests to `oauth.reddit.com/api/info` with `t3_`-prefixed fullnames (100 per request) using the cached OAuth app token

#### Scenario: Reddit credentials absent
- **WHEN** REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET is unset
- **THEN** the job skips reddit items with a logged reason and still refreshes hackernews and devto items

#### Scenario: Request budget respected
- **WHEN** in-scope items would require more than `NEWS_REFRESH_MAX_REQUESTS` requests
- **THEN** the job stops issuing requests at the cap, having processed the youngest items first

#### Scenario: Unsupported sources are skipped
- **WHEN** items from `rss:*` or `github_trending` are within the window
- **THEN** the job does not issue any request for them

### Requirement: Source Removal Detection
When a re-fetch returns HTTP 404 or 410, or the source API reports the item
deleted/removed, the system SHALL set `source_removed: true` on the item and
SHALL NOT delete it.

#### Scenario: Deleted HN story
- **WHEN** the item endpoint returns `null`/404 for a stored hackernews item
- **THEN** the item is marked `source_removed: true` and remains in the collection

### Requirement: Refresh Run History
Each refresh run SHALL persist one `maintenance_runs` document
(`job: 'engagement_refresh'`) with timings and counts (candidates, refreshed,
source_removed, request_count, per-source errors). Persistence failure SHALL NOT
fail the refresh. Documents SHALL expire after 30 days.

#### Scenario: Run summary persisted
- **WHEN** a refresh run completes
- **THEN** a maintenance run document exists with `job: 'engagement_refresh'` and consistent counts

#### Scenario: Lock prevents concurrent runs
- **WHEN** a refresh run is already holding the Redis lock
- **THEN** a second invocation exits without fetching or writing anything
