## ADDED Requirements

### Requirement: GNews.io Query Source
The pipeline SHALL include a `gnews` adapter driven by `GNEWS_API_KEY` and
`NEWS_INGESTION_GNEWS_QUERIES` (comma-separated topics, at most 3 used per
run). Both SHALL be required for the source to be considered configured; when
either is absent, the adapter SHALL make no network calls and report itself
unconfigured, and the server SHALL boot normally. For each configured topic
the adapter SHALL query the GNews.io search API and map each returned article
directly to a news item using the article's own URL (no redirect resolution
or canonicalization is required, since GNews.io returns real publisher URLs).
A single failing query SHALL NOT prevent the other configured queries from
contributing results; the adapter SHALL throw only when every query fails.

#### Scenario: Articles normalized with the publisher URL
- **WHEN** the adapter queries a configured topic and GNews.io returns an article with `url: "https://www.example-news.com/article"`
- **THEN** the emitted item has `source: "gnews"`, `url` and `source_id` equal to that same URL, and `published_at` from the article's `publishedAt`

#### Scenario: Query cap enforced
- **WHEN** five topics are configured
- **THEN** only the first three are queried and a warning is logged

#### Scenario: One query fails
- **WHEN** one configured topic's request fails and another succeeds
- **THEN** the adapter logs the failure and returns the successful topic's items

#### Scenario: Unconfigured by default
- **WHEN** `GNEWS_API_KEY` or `NEWS_INGESTION_GNEWS_QUERIES` is unset or empty
- **THEN** the adapter makes no network calls and the run history shows a "not configured" reason for `gnews`
