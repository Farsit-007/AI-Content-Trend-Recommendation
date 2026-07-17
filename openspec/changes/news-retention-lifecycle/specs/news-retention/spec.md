## ADDED Requirements

### Requirement: News Item Lifecycle States
Every news item SHALL carry a `lifecycle` state (`active` | `archived`,
default `active`, indexed) with `archived_at` and `archive_reason`
(`max_age` | `trend_floor` | `source_removed`) set on archival. Items missing
the field (pre-migration rows) SHALL be treated as active and backfilled
idempotently by the retention job.

#### Scenario: Restore via admin update
- **WHEN** an admin PATCHes an archived item with `lifecycle: "active"`
- **THEN** the item returns to the feed and its `archived_at`/`archive_reason` are cleared

#### Scenario: Legacy row treated as active
- **WHEN** a row created before this change has no `lifecycle` field and the retention job has not yet run
- **THEN** it is treated as active by every read-path filter (`lifecycle: { $ne: 'archived' }`)

### Requirement: Scheduled Archival of Old and Out-of-Trend Items
A Redis-locked retention job (cron `NEWS_RETENTION_CRON`, default every 6
hours) SHALL archive active items (capped per run) when any of the following
holds: age since `created_at` exceeds `NEWS_ARCHIVE_MAX_AGE_HOURS` (default
96); OR age exceeds `NEWS_ARCHIVE_MIN_AGE_HOURS` (default 36) AND
`current_trend_score` is below `NEWS_ARCHIVE_TREND_FLOOR` (default 2.0) AND
the item has an engagement signal (source has a registered engagement
fetcher, or nonzero stored engagement); OR `source_removed` is true. Items
SHALL NOT be archived while referenced by a category override newer than 30
days, or while `needs_review` and younger than 7 days.

#### Scenario: 3-4 day ceiling
- **WHEN** an active item's `created_at` is older than `NEWS_ARCHIVE_MAX_AGE_HOURS`
- **THEN** the next retention run archives it with reason `max_age`

#### Scenario: Out-of-trend archive
- **WHEN** an item older than `NEWS_ARCHIVE_MIN_AGE_HOURS` has a `current_trend_score` below `NEWS_ARCHIVE_TREND_FLOOR` and a nonzero engagement signal
- **THEN** it is archived with reason `trend_floor`

#### Scenario: Engagement-less sources are exempt from the floor
- **WHEN** an item older than `NEWS_ARCHIVE_MIN_AGE_HOURS` has no engagement signal (score 0 from a non-refreshable, zero-engagement source)
- **THEN** it is NOT archived on the trend floor, only once it reaches `NEWS_ARCHIVE_MAX_AGE_HOURS`

#### Scenario: Slow starter gets its grace period
- **WHEN** an item is younger than `NEWS_ARCHIVE_MIN_AGE_HOURS` with a score below the floor
- **THEN** it is not archived (minimum age not reached)

#### Scenario: Curated item protected
- **WHEN** an otherwise-archivable item has a category override made within the last 30 days
- **THEN** it is not archived by this run

#### Scenario: Fresh needs-review item protected
- **WHEN** an otherwise-archivable item has `needs_review: true` and is younger than 7 days
- **THEN** it is not archived by this run

#### Scenario: Source-removed archives immediately regardless of age
- **WHEN** an item has `source_removed: true`
- **THEN** it is archived with reason `source_removed` on the next retention run, independent of age or score

### Requirement: Archived Items Leave Product Surfaces
Archived items SHALL be excluded from the default feed listing, report
opportunity candidates, chat news context, auto-generation candidates, and
the ingestion embedding pool. Fetch-by-id SHALL still resolve archived
items, and an explicit `?lifecycle=archived` feed query (admin escape
hatch) SHALL return them.

#### Scenario: Archived item absent from default feed
- **WHEN** `GET /news-items` is called with no `lifecycle` parameter
- **THEN** archived items do not appear, while legacy rows without the field do

#### Scenario: Escape hatch
- **WHEN** `GET /news-items?lifecycle=archived` is called
- **THEN** only archived items are returned

#### Scenario: Fetch-by-id still resolves archived items
- **WHEN** `GET /news-items/:id` is called for an archived item's id
- **THEN** the item is returned normally, not a 404

#### Scenario: Report, chat, and auto-generation candidate pools exclude archived items
- **WHEN** report opportunity scoring, chat news-context pooling, or auto-generation candidate selection run
- **THEN** none of their results include an archived item

### Requirement: Cascaded Hard Delete After Cooling-Off
The retention job SHALL hard-delete items archived more than
`NEWS_DELETE_AFTER_DAYS` (default 14) days ago, in batches of at most 500,
executing per batch in order: tombstone insertion into the dedup ledger,
then category-override cleanup, then item deletion. Each retention run
SHALL persist a `maintenance_runs` document (`job: 'retention'`) with
per-stage counts. Persistence failure SHALL NOT fail the retention run.

#### Scenario: Cascade removes overrides
- **WHEN** a hard-deleted item had category overrides
- **THEN** those override rows are deleted in the same batch

#### Scenario: Crash between tombstone and delete is safe
- **WHEN** the job fails after writing a batch's tombstones but before deleting the items
- **THEN** the items still exist, the extra tombstones are harmless, and the next run completes the deletion

#### Scenario: Retention run recorded
- **WHEN** a retention run completes
- **THEN** a `maintenance_runs` document with `job: 'retention'` and per-stage counts exists
