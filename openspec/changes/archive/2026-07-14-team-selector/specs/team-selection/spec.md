## ADDED Requirements

### Requirement: Resolve active team from the authenticated user
The system SHALL resolve the active `team_id` by calling `GET /auth/me` to obtain the current user's `team_ids`, and SHALL never require a build-time constant to determine the active team when a valid `auth_token` is present.

#### Scenario: Authenticated user with one team
- **WHEN** `GET /auth/me` succeeds and returns exactly one entry in `team_ids`
- **THEN** the system sets that team as the active team without requiring any user interaction

#### Scenario: Authenticated user with multiple teams
- **WHEN** `GET /auth/me` succeeds and returns more than one entry in `team_ids`
- **THEN** the system resolves team names via `GET /teams` and makes all of the user's teams available for selection

### Requirement: Persist and restore the active team selection
The system SHALL persist the active `team_id` in `localStorage` under the key `active_team_id`, and SHALL restore it on subsequent loads if it is still present in the user's current `team_ids`.

#### Scenario: Returning user with a still-valid stored team
- **WHEN** the page loads and `localStorage` contains an `active_team_id` that appears in the freshly-fetched `team_ids`
- **THEN** the system restores that team as the active team without prompting the user to re-select

#### Scenario: Stored team no longer valid
- **WHEN** the page loads and `localStorage` contains an `active_team_id` that does NOT appear in the freshly-fetched `team_ids`
- **THEN** the system discards the stored value and falls back to the first entry in `team_ids`

### Requirement: User can switch active team
The system SHALL let a user belonging to more than one team switch the active team from a selector in the dashboard header, and SHALL update `localStorage` and all subsequent team-scoped requests to use the newly selected team immediately.

#### Scenario: Switching teams
- **WHEN** a user with multiple teams selects a different team from the selector
- **THEN** the active team updates immediately, the new selection is persisted to `localStorage`, and the next team-scoped API call uses the new team id

#### Scenario: Single-team user sees no switcher
- **WHEN** the current user belongs to exactly one team
- **THEN** the dashboard header displays that team's name as a static label rather than an interactive selector

### Requirement: Fallback when no authenticated team context is available
The system SHALL fall back to the `NEXT_PUBLIC_DEFAULT_TEAM_ID` environment variable as the active team when `GET /auth/me` fails (missing/invalid token, network error) or returns zero teams, and SHALL NOT block rendering of team-scoped pages while resolving the active team.

#### Scenario: No auth token present
- **WHEN** no `auth_token` is present in `localStorage`
- **THEN** the system does not call `GET /auth/me`, uses `NEXT_PUBLIC_DEFAULT_TEAM_ID` as the active team, and renders team-scoped pages normally

#### Scenario: Auth request fails
- **WHEN** `GET /auth/me` returns an error or the request fails
- **THEN** the system logs the failure, uses `NEXT_PUBLIC_DEFAULT_TEAM_ID` as the active team, and does not block or blank out the dashboard

#### Scenario: Authenticated user with zero teams
- **WHEN** `GET /auth/me` succeeds but `team_ids` is empty
- **THEN** the system uses `NEXT_PUBLIC_DEFAULT_TEAM_ID` as the active team

### Requirement: Team-scoped API calls use the active team
The system SHALL source the `team_id` used by `content/generate`, team category management, and news item mutations from the active team resolved by this capability, and SHALL NOT read a hardcoded or duplicated team id constant in those call sites.

#### Scenario: Content generation uses the active team
- **WHEN** a user submits a content-generation request
- **THEN** the request's `team_id` matches the currently active team, not a build-time constant

#### Scenario: Active team changes mid-session
- **WHEN** the user switches teams and then triggers a team-scoped API call (e.g. fetching categories)
- **THEN** the call uses the newly active team's id
