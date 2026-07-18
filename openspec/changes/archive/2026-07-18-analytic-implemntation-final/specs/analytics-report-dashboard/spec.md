## ADDED Requirements

### Requirement: Report dashboard rendering

The system SHALL render a Report dashboard that displays analytics rollups per connected platform, replacing the current stub, using existing analytics and reports endpoints.

#### Scenario: Platform tabs from available rollups

- **WHEN** the dashboard loads for a team
- **THEN** it fetches `GET /analytics?teamId=<id>` and `GET /reports?teamId=<id>` and shows a tab per platform that has a rollup (Facebook, Instagram).

#### Scenario: Overview and detail sections

- **WHEN** a platform rollup has `status: 'ok'`
- **THEN** the dashboard renders overview stat cards (Reach, Views, Engagements, Engagement Rate), a top-posts table (snippet, format chip, reach, engagement), a best-times heatmap (day × hour), and a format breakdown list.

#### Scenario: Mobile-first responsiveness

- **WHEN** the viewport is below 640px
- **THEN** the top-posts table collapses to cards and the layout remains usable at 375px in dark mode.

### Requirement: Report status states

The system SHALL render clear non-ok states so a broken or unconnected platform is never shown as silent zeros.

#### Scenario: Not-connected state

- **WHEN** a rollup has `status: 'not_connected'`
- **THEN** the dashboard shows a CTA linking to the Platforms settings page.

#### Scenario: Pending-approval and error states

- **WHEN** a rollup has `status: 'pending_approval'` or `status: 'error'`
- **THEN** the dashboard shows an info banner for pending approval, and for errors a retry hint with the `fetched_at` timestamp.

#### Scenario: Demo-data badge

- **WHEN** a rollup is served from mock data (`is_mock` true)
- **THEN** the dashboard shows a "Demo data" badge on that platform's view.

#### Scenario: Loading skeletons

- **WHEN** analytics data is still loading
- **THEN** the dashboard shows loading skeletons rather than empty content.
