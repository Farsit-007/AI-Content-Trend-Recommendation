## ADDED Requirements

### Requirement: Teams can define custom categories
Each `Team` SHALL be able to maintain a list of custom category labels (`custom_categories`) in addition to the fixed default taxonomy (`AI`, `Web Dev`, `Career`, `Security`, `DevOps`, `Other`).

#### Scenario: Team member adds a custom category
- **WHEN** an authenticated user who belongs to a team submits a new category label for that team
- **THEN** the label is appended to that team's `custom_categories` and becomes available for that team to use when overriding a news item's category

#### Scenario: Duplicate category rejected
- **WHEN** a submitted category label matches (case-insensitively) an existing default category or one already in the team's `custom_categories`
- **THEN** the request is rejected with a validation error and the list is not modified

#### Scenario: Category list length limit
- **WHEN** a team's `custom_categories` already contains the maximum allowed number of entries
- **THEN** a request to add another custom category is rejected with a validation error

### Requirement: Only team members can manage a team's custom categories
Managing a team's `custom_categories` (add or remove) SHALL be restricted to authenticated users who belong to that team, or global admins, using the same access rule as other team-scoped resources.

#### Scenario: Non-member attempts to modify categories
- **WHEN** an authenticated user who is not a member of a team and is not an admin attempts to add or remove a custom category for that team
- **THEN** the request is rejected as forbidden

### Requirement: Effective category set combines default and custom categories
For any team, the effective set of categories available for filtering the Feed or applying an override SHALL be the fixed default taxonomy plus that team's `custom_categories`.

#### Scenario: Team views its effective categories
- **WHEN** a team member requests the categories available to their team
- **THEN** the response includes the fixed default categories followed by that team's `custom_categories`
