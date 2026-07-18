## ADDED Requirements

### Requirement: Decayed Current Trend Score
The system SHALL maintain a stored `current_trend_score` (0–10) on every news
item: computed at ingest and recomputed for every item the engagement-refresh
job touches (including items marked `source_removed`), as the ingest-formula
trend base times an exponential age-decay factor
(`exp(−age_hours / NEWS_TREND_DECAY_TAU_HOURS)`, default TAU 36, age measured
from `published_at` falling back to `created_at`), plus a bounded velocity bonus
(`NEWS_TREND_VELOCITY_BONUS × log10(1 + max(0, Δweighted_engagement/hour))`,
default bonus 2) derived from the two most recent `engagement_history`
snapshots, clamped to [0, 10]. The score SHALL never be computed per-request.
Items with no engagement signal decay from a base of zero. Existing rows
without a `current_trend_score` SHALL be idempotently backfilled from their
`trend_score` at the start of every refresh run.

#### Scenario: Score decays with age
- **WHEN** an item's engagement is unchanged across two refresh runs
- **THEN** its `current_trend_score` after the later run is lower than after the earlier run

#### Scenario: Rising story resists decay
- **WHEN** an item's engagement grew between the last two snapshots
- **THEN** its recomputed score includes a positive velocity bonus

#### Scenario: Ingest-time initialization
- **WHEN** a new item is stored by the ingestion pipeline
- **THEN** it has a `current_trend_score` approximately equal to its `trend_score`

#### Scenario: Removed item still decays
- **WHEN** a refresh run marks an item `source_removed: true` (no new engagement snapshot available)
- **THEN** the item's `current_trend_score` is still recomputed for the elapsed age, using its existing engagement history

#### Scenario: Pre-existing rows are backfilled
- **WHEN** a refresh run starts and rows exist with no `current_trend_score` field
- **THEN** those rows are set to their stored `trend_score` before the run's candidate query executes, and rows that already have the field are left untouched

### Requirement: Ranking Consumes the Live Score
Feed listing (`GET /news-items` with no explicit `sort`), chat news-context
pooling, report opportunity scoring, and auto-generation candidate selection
SHALL rank by `current_trend_score` (falling back to `trend_score` for
not-yet-backfilled rows), with `created_at` (descending) as the feed tie-break.
An explicit `?sort=` on the feed SHALL still be honored unchanged.
`current_trend_score` SHALL NOT be settable via the news-item update endpoint.

#### Scenario: Stale item sinks from feed page 1
- **WHEN** the feed is requested with no sort parameter and the collection holds a 4-day-old high-ingest-score item plus fresher items with nonzero scores
- **THEN** the stale item does not rank above the fresher items

#### Scenario: Explicit sort untouched
- **WHEN** a client requests `?sort=-created_at`
- **THEN** results are ordered by that expression exactly as before

#### Scenario: Score field is not admin-editable
- **WHEN** an admin sends `PATCH /news-items/:id` with a `current_trend_score` field in the body
- **THEN** the request is rejected by validation or the field is silently ignored, and the stored value is unchanged by that request
