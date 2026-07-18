## ADDED Requirements

### Requirement: Manual Draft Persistence
`POST /generated-content` SHALL create a team-scoped manual draft (`source: 'manual'`, `status: 'draft'`) holding at least one format, gated by the same team-access check as the module's other endpoints. Uniqueness of team+news-item pairs SHALL constrain only auto-generated drafts (a partial unique index scoped to `source: 'auto'`), so manual saves never conflict with the auto job's per-pair dedupe — which SHALL continue to skip items already drafted by either source, since the auto job's own dedupe check queries across both sources regardless of the index's scope.

#### Scenario: Manual save coexists with auto draft
- **WHEN** the auto job already drafted item X for team T and a member saves a manual draft for the same pair
- **THEN** the manual save succeeds and both documents appear in the team's draft list

#### Scenario: Auto dedupe still holds
- **WHEN** the auto job encounters a pair it already auto-drafted (by either source)
- **THEN** it skips drafting that pair again

#### Scenario: Topic-only manual draft
- **WHEN** a member saves a manual draft with a `topic` but no `news_item_id`
- **THEN** the draft is created successfully

#### Scenario: Missing formats rejected
- **WHEN** a manual draft is submitted with no populated format fields
- **THEN** the request fails validation with HTTP 400

#### Scenario: Foreign team rejected
- **WHEN** a user who is not a member of `team_id` (and not an admin) attempts to save a manual draft
- **THEN** the request is rejected with HTTP 403

#### Scenario: Second manual variant for the same pair is allowed
- **WHEN** a team saves a second manual draft for a team+news-item pair it has already saved a manual draft for
- **THEN** both manual drafts are created and coexist (uniqueness applies only to `source: 'auto'`)
