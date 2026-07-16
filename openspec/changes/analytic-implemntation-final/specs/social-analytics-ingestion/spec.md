## ADDED Requirements

### Requirement: Facebook real adapter

The system SHALL fetch real Facebook Page performance data via the official Graph API using the stored Page token and the post-June-2026 views-family insight metrics.

#### Scenario: Fetch Page posts with real metrics

- **WHEN** the Facebook adapter runs for a connected Page
- **THEN** it calls `GET /{page_id}/published_posts` with a 30-day `since` window requesting engagement summaries (reactions, comments, shares), attachment media type, and insights `post_media_view` and `post_media_view_unique`, following `paging.next` up to 4 pages (max 100 posts).

#### Scenario: Map Graph fields to adapter post metrics

- **WHEN** the adapter maps a Graph post
- **THEN** it sets `views` from `post_media_view`, `reach` from `post_media_view_unique`, `likes` from `reactions.summary.total_count`, `comments` from `comments.summary.total_count`, `shares` from `shares.count` (0 when absent), and `format` from `attachments.media_type`.

#### Scenario: Insights metric drift tolerated

- **WHEN** an insights request returns `(#100) metric not supported` for `post_media_view`/`post_media_view_unique`
- **THEN** the adapter zeroes only the affected views/reach metrics, keeps engagement data, and logs the drift — it does not fail the whole post list.

### Requirement: Instagram real adapter

The system SHALL fetch real Instagram Business media performance via the Graph API using the same Page token and the linked `ig_user_id`.

#### Scenario: Fetch IG media and per-media insights

- **WHEN** the Instagram adapter runs for a linked account
- **THEN** it calls `GET /{ig_user_id}/media` for the last 30 days requesting `like_count`, `comments_count`, `media_product_type`, and timestamp, then requests per-media insights (`views,reach,saved`, plus `shares` for reels) using batched requests.

#### Scenario: Map IG fields and skip stories

- **WHEN** the adapter maps IG media
- **THEN** it maps `views→views`, `reach→reach`, `like_count→likes`, `comments_count→comments`, reel `shares→shares`, derives `format` from `media_product_type` (`FEED`→post, `REELS`→reel), and skips `STORY` items.

### Requirement: Per-platform real/mock selection

The system SHALL select real vs mock adapters per platform via an allowlist while preserving the all-mock test path.

#### Scenario: Only allowlisted platforms go real

- **WHEN** `ANALYTICS_USE_MOCK_ADAPTERS=false` and `ANALYTICS_REAL_PLATFORMS=facebook,instagram`
- **THEN** `getAdapter('facebook')` and `getAdapter('instagram')` return the real adapters (receiving token and account id), while every other platform returns the mock adapter.

#### Scenario: Global mock switch forces all-mock

- **WHEN** `ANALYTICS_USE_MOCK_ADAPTERS=true` (default, including `NODE_ENV=test`)
- **THEN** every platform resolves to the mock adapter regardless of `ANALYTICS_REAL_PLATFORMS`.

#### Scenario: Deferred platforms are not real

- **WHEN** the adapter registry is initialized
- **THEN** `youtube` and `linkedin` are not present in the real-adapter map and always resolve to mock.

### Requirement: Graph API error taxonomy

The system SHALL translate Graph API errors into rollup outcomes so token death and rate limits degrade gracefully without crashing the refresh run.

#### Scenario: Dead token yields not_connected

- **WHEN** a Graph call returns error code 190 (any subcode) for a team+platform
- **THEN** the system upserts that rollup with `status: 'not_connected'`, sets `token_expires_at: now` on the credential, and does not retry.

#### Scenario: Missing permission yields not_connected

- **WHEN** a Graph call returns error code 10 or 200–299
- **THEN** the system upserts `not_connected` and logs which permission is missing.

#### Scenario: App-level rate limit aborts the run

- **WHEN** a Graph call returns error code 4, or `X-App-Usage` exceeds 90%
- **THEN** the system aborts the entire refresh run, logs it, and lets the next cron retry.

#### Scenario: User/Page rate limit skips one platform

- **WHEN** a Graph call returns error code 17 or 32
- **THEN** the system skips that team+platform for this run with `status: 'error'` and continues other teams/platforms.

#### Scenario: Transient error retried once

- **WHEN** a Graph call returns error code 1 or 2
- **THEN** the system retries once after a 5-second delay, then sets `status: 'error'` if it still fails.

### Requirement: Rate-limit safeguards

The system SHALL keep Graph API usage well within Meta's limits and observe usage headers.

#### Scenario: Usage headers observed

- **WHEN** any Graph response returns `X-App-Usage` or `X-Business-Use-Case-Usage`
- **THEN** the system logs a warning at >75% utilization and triggers the app-rate-limit abort path at >90%.

#### Scenario: Calls are paced and batched

- **WHEN** the adapters issue multiple Graph calls
- **THEN** they use the existing inter-call pacing, batch per-media IG insights (≤50 sub-requests per HTTP call), and always send `since` + `fields` filters — never unfiltered feeds.
