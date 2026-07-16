## ADDED Requirements

### Requirement: Mastodon Trending-Links Source
The pipeline SHALL include a `mastodon` adapter that fetches the public
trending-links endpoint of each instance configured in
`NEWS_INGESTION_MASTODON_INSTANCES` (default `mastodon.social,fosstodon.org`),
merges results across instances deduplicated by link URL (keeping the copy with
the higher sharer count), maps today's distinct-sharer count to `raw_points`
(coercing the API's string values to numbers), and sets `published_at` to fetch
time so items participate in freshness filtering and the semantic-dedup pool.
When the instance list is configured empty, the adapter SHALL report itself
unconfigured instead of fetching. The server SHALL boot with the variable unset.

#### Scenario: Trending links normalized with share counts
- **WHEN** an instance returns a trending link with `history[0].accounts: "57"`
- **THEN** the emitted item has `source: "mastodon"`, `raw_points: 57`, and a `published_at` within the current run

#### Scenario: Same link trending on two instances
- **WHEN** both configured instances return the same URL with sharer counts "40" and "25"
- **THEN** the adapter emits that URL once with `raw_points: 40`

#### Scenario: One instance is down
- **WHEN** one instance request fails and the other succeeds
- **THEN** the adapter logs the failure and returns the successful instance's items

#### Scenario: Disabled by configuration
- **WHEN** `NEWS_INGESTION_MASTODON_INSTANCES` is set to an empty value
- **THEN** the adapter makes no network calls and the run history records a "not configured" reason for source `mastodon`
