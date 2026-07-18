## ADDED Requirements

### Requirement: Any authenticated user can check when ingestion last completed
`GET /news-items/last-ingested-at` SHALL return the most recently completed `IngestionRun`'s id and
completion timestamp to any authenticated user, regardless of role — this is a read of global,
non-sensitive operational metadata, not admin-only ingestion-run detail.

#### Scenario: A non-admin team member checks
- **WHEN** a user with role `user` (not admin/super_admin) requests
  `GET /news-items/last-ingested-at`
- **THEN** the request succeeds and returns the latest run's id and `finished_at`

#### Scenario: No ingestion run has ever completed
- **WHEN** the endpoint is called before any `IngestionRun` document exists
- **THEN** it returns a response indicating no run has happened yet, not an error

### Requirement: The news feed refreshes after ingestion completes, regardless of trigger
The frontend SHALL detect when a new ingestion run has completed — whether triggered manually or by
the cron schedule — and refresh the cached news feed accordingly, for any authenticated user with
the Feed page (or dashboard) open.

#### Scenario: Cron-triggered ingestion while a user has the Feed open
- **WHEN** the scheduled cron ingestion completes while a user's browser tab has been open the
  entire time (no manual reload, no window blur/focus cycle)
- **THEN** the feed's cached data is invalidated and refreshed within a bounded, short interval of
  that completion, without the user taking any action

#### Scenario: Manual ingestion trigger (already-working case, unchanged)
- **WHEN** an admin triggers ingestion from the Admin page and it completes
- **THEN** the news feed refreshes as it already does today
