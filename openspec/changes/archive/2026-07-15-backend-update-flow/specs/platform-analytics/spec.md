## ADDED Requirements

### Requirement: Analytics module fetches per-team platform data
The system SHALL fetch 30-day social media data for each team × each enabled platform, storing raw posts in `platform_posts` and computed rollups in `platform_analytics`. Each platform adapter SHALL be isolated so one failure does not block other platforms. Credentials SHALL be resolved exclusively from the team's own `PlatformCredential` records stored in MongoDB — no `.env` bootstrap fallback.

#### Scenario: Successful analytics refresh for a team
- **WHEN** `runAnalyticsRefresh()` is called for a team with enabled platforms and the team has added credentials for those platforms via the frontend
- **THEN** for each enabled platform the system fetches 30-day posts via the appropriate adapter, upserts them in `platform_posts`, computes a rollup, and upserts it in `platform_analytics` with `status: 'ok'`

#### Scenario: Team has not added credentials for a platform
- **WHEN** a platform is enabled for a team but the team has not added a credential via `POST /teams/:teamId/credentials`
- **THEN** the system writes a rollup with `status: 'not_connected'` and continues processing remaining platforms without error

#### Scenario: Adapter fetch fails
- **WHEN** an adapter throws an error during fetch
- **THEN** the system writes a rollup with `status: 'error'`, logs the error, and continues processing remaining platforms without rethrowing

### Requirement: Mock adapter replaces real adapters when flag is set
When `ANALYTICS_USE_MOCK_ADAPTERS=true`, the system SHALL route all adapter calls through `adapters/mock.ts`, which returns deterministic realistic 30-day post data seeded on `team_id + platform`.

#### Scenario: Mock mode active
- **WHEN** `ANALYTICS_USE_MOCK_ADAPTERS=true` and analytics refresh runs
- **THEN** no external API calls are made; mock data is used for all platforms and produces valid rollups

#### Scenario: Real adapter mode active with team credentials
- **WHEN** `ANALYTICS_USE_MOCK_ADAPTERS=false` and the team has added a credential for the platform via the frontend
- **THEN** the real platform adapter (Facebook or YouTube) is called with the token resolved from that team's `PlatformCredential` record

### Requirement: LinkedIn returns pending_approval status
The LinkedIn adapter SHALL always return `status: 'pending_approval'` without making any API calls, representing a pre-agreed descope.

#### Scenario: LinkedIn platform included in enabled platforms
- **WHEN** analytics refresh encounters LinkedIn as an enabled platform
- **THEN** the rollup for LinkedIn is written with `status: 'pending_approval'` and no external call is made

### Requirement: Analytics runs on a configurable 6-hour cron
The system SHALL register an analytics refresh cron job in `lib/scheduler.ts` using the `ANALYTICS_REFRESH_CRON` env var (default: `0 */6 * * *`).

#### Scenario: Server starts with analytics cron
- **WHEN** the server starts
- **THEN** the analytics cron is registered and will run at the configured interval

### Requirement: Admin can trigger analytics refresh on demand
The system SHALL expose `POST /analytics/refresh` (admin-only) that triggers `runAnalyticsRefresh()` immediately and returns a summary of platforms processed.

#### Scenario: Admin triggers refresh
- **WHEN** an admin sends `POST /analytics/refresh`
- **THEN** the system runs the analytics job synchronously and returns `{ success: true, teamsProcessed, platformsProcessed }`

#### Scenario: Non-admin attempts refresh
- **WHEN** a non-admin user sends `POST /analytics/refresh`
- **THEN** the system returns HTTP 403

### Requirement: Team member can read their analytics status
The system SHALL expose `GET /analytics?team_id=<id>` (team member+) that returns the current `platform_analytics` rollups for that team.

#### Scenario: Team member reads analytics
- **WHEN** a team member sends `GET /analytics?team_id=<id>`
- **THEN** the system returns an array of rollup documents for that team's enabled platforms

### Requirement: Seed script populates demo data idempotently
The system SHALL provide `npm run seed:demo-analytics` that inserts realistic `platform_posts` with embeddings and computes rollups for all teams. Re-running the script SHALL not duplicate data.

#### Scenario: First seed run
- **WHEN** `npm run seed:demo-analytics` runs on an empty database
- **THEN** realistic posts are inserted, embeddings are computed, and rollups are written for all teams × platforms

#### Scenario: Subsequent seed run
- **WHEN** `npm run seed:demo-analytics` runs on a database that already has seed data
- **THEN** no duplicate posts or rollups are created; the script exits cleanly

### Requirement: Analytics invalidates report cache on completion
After each successful analytics refresh, the system SHALL delete the `report:{team_id}` key from Redis for every refreshed team.

#### Scenario: Analytics refresh completes
- **WHEN** analytics refresh finishes for a team
- **THEN** `report:{team_id}` is deleted from Redis so the next report request recomputes fresh data
