# team-readiness

## ADDED Requirements

### Requirement: Team readiness is computed from existing configuration
A team SHALL be considered "ready" if and only if it has at least one entry in
`subscribed_categories` AND at least one `BrandVoiceExample` document. Readiness SHALL be computed
on read, not stored as separate mutable state.

#### Scenario: Freshly created team
- **WHEN** a team has empty `subscribed_categories` and no brand-voice examples
- **THEN** the team is not ready

#### Scenario: Categories set, no brand voice yet
- **WHEN** a team has at least one subscribed category but zero brand-voice examples
- **THEN** the team is not ready

#### Scenario: Fully configured team
- **WHEN** a team has at least one subscribed category and at least one brand-voice example
- **THEN** the team is ready

### Requirement: The news feed does not show unfiltered results to a not-ready team
`GET /news-items` scoped to a not-ready team SHALL return an empty result set with a `team_ready:
false` flag instead of the unfiltered global item pool.

#### Scenario: Not-ready team requests the feed
- **WHEN** a team with no subscribed categories requests `GET /news-items`
- **THEN** the response has `data: []` and `team_ready: false`, and no unfiltered global items are
  returned

#### Scenario: Ready team requests the feed
- **WHEN** a ready team requests `GET /news-items` without an explicit `?category=`
- **THEN** the response is filtered to the team's subscribed categories as before, with
  `team_ready: true`

### Requirement: Chat does not attempt grounded answers for a not-ready team
`POST /chat` for a not-ready team SHALL return a fixed, language-aware guidance message directing
the user to complete Team Settings, without calling the embedding or chat completion providers.

#### Scenario: Not-ready team sends a chat message
- **WHEN** a team with no brand-voice examples sends any chat message
- **THEN** the response is the fixed guidance message and no embedding or LLM call is made

### Requirement: Auto-generation only drafts for ready teams
The scheduled auto-generation job SHALL skip any team that is not ready, using the same readiness
definition as the feed and chat gates.

#### Scenario: Job run includes a not-ready team
- **WHEN** the auto-generation job processes a team with no subscribed categories
- **THEN** that team is skipped and counted in the run summary's skipped count, with zero LLM calls
  made for it
