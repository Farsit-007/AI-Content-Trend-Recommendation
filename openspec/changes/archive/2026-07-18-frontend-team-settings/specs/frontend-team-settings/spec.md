## ADDED Requirements

### Requirement: Team Settings Page
`/dashboard/settings/team` SHALL let team admins edit the voice profile (default language, custom instructions ≤500 chars with a live counter), category subscriptions (fixed-taxonomy checkboxes, empty selection meaning all categories), and default style pack, and SHALL let them manage brand-voice examples (list, add with content/platform/category/engagement-hint, delete) with an educational empty state. Non-admin members SHALL see the current values of every section read-only with an explanatory hint, and no save/add/delete control SHALL be actionable for them. Any section whose backing capability is absent from the deployed backend SHALL hide rather than render an error.

#### Scenario: Voice profile saved
- **WHEN** an admin changes default language to English and saves
- **THEN** the `PATCH /teams/:id` request succeeds and subsequent Generate sessions preselect English

#### Scenario: Custom instructions respect the character limit
- **WHEN** an admin types custom instructions
- **THEN** a live counter shows characters used out of 500 and input beyond 500 characters is prevented

#### Scenario: Category subscriptions default to all
- **WHEN** an admin views subscriptions with none explicitly selected
- **THEN** the UI communicates that all fixed-taxonomy categories are currently included

#### Scenario: Brand voice example added
- **WHEN** an admin submits a Bangla post as an example (content, platform, optional category, optional engagement hint)
- **THEN** it appears in the list immediately and the educational empty state disappears

#### Scenario: Brand voice example deleted
- **WHEN** an admin deletes a brand-voice example and confirms
- **THEN** it is removed from the list without a full page reload

#### Scenario: Empty brand-voice state teaches the user
- **WHEN** a team has zero brand-voice examples
- **THEN** the page shows guidance to add 25-30 real posts, explaining that every generation copies style from these examples

#### Scenario: Non-admin is read-only
- **WHEN** a regular (non-admin) member opens the page
- **THEN** every section's inputs are disabled with an explanatory hint and no save, add, or delete control is actionable

#### Scenario: Subscriptions section hides pre-5A
- **WHEN** the deployed backend's team document has no category-subscriptions field
- **THEN** the subscriptions section does not render, and no error is shown

#### Scenario: Style pack section hides pre-6A
- **WHEN** fetching the list of style packs fails because the endpoint does not exist yet
- **THEN** the default-style-pack section does not render, and no error is shown

### Requirement: Team Switcher
The dashboard SHALL provide a team switcher listing the current user's teams (all teams in the system for users with role admin or super_admin; membership-scoped teams otherwise), persisting the selected team id across reloads, with every team-scoped page (feed, generate, drafts, report, settings) following the switched team without requiring re-login. A user with role super_admin SHALL receive the full team list from the backend rather than an empty membership-scoped list.

#### Scenario: Switching changes every page
- **WHEN** a member of two teams switches teams via the Navbar dropdown
- **THEN** feed, drafts, and settings pages reflect the newly selected team without a relogin

#### Scenario: Selection survives reload
- **WHEN** a user selects a team and reloads the browser
- **THEN** the same team remains selected

#### Scenario: Stale stored selection falls back gracefully
- **WHEN** the team id stored from a previous session is no longer in the user's current team list
- **THEN** the switcher falls back to the first membership without showing an error

#### Scenario: super_admin sees all teams
- **WHEN** a super_admin opens the switcher
- **THEN** all teams in the system are listed, because the backend no longer returns an empty membership-scoped list for that role

#### Scenario: Switcher hidden for single-team users
- **WHEN** a user belongs to only one team
- **THEN** the Navbar does not show a switcher control
