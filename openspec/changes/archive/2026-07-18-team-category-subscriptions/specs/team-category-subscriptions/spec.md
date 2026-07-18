## ADDED Requirements

### Requirement: Team Category Subscriptions
A team SHALL have `subscribed_categories`, an editable subset of the fixed news taxonomy (`AI`, `Web Dev`, `Career`, `Security`, `DevOps`, `Other`), defaulting to an empty array meaning "all categories." Values outside the fixed taxonomy SHALL be rejected with a validation error. The existing `custom_categories` feature (override-label taxonomy extension) SHALL be unaffected by this requirement.

#### Scenario: Admin sets subscriptions
- **WHEN** an admin PATCHes a team with `subscribed_categories: ["AI", "Web Dev"]`
- **THEN** the team document stores exactly those values and subsequent team reads include them

#### Scenario: Invalid category rejected
- **WHEN** a PATCH includes `subscribed_categories: ["Robotics"]`
- **THEN** the request fails validation with HTTP 400 and the team is unchanged

#### Scenario: Default is empty
- **WHEN** a new team is created without specifying `subscribed_categories`
- **THEN** the team document stores `subscribed_categories: []`

#### Scenario: custom_categories unaffected
- **WHEN** a team with existing `custom_categories` has `subscribed_categories` set via PATCH
- **THEN** `custom_categories` remains exactly as it was before the request
