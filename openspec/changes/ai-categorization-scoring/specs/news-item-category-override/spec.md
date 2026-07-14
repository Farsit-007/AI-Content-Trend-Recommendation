## ADDED Requirements

### Requirement: A team can override a news item's category and/or opportunity score
An authenticated user who belongs to a team SHALL be able to set an override for a specific `NewsItem`, recording that team's chosen `category` and/or `opportunity_score` without modifying the shared `NewsItem` document or affecting any other team's view of it.

#### Scenario: Team member overrides category only
- **WHEN** a team member submits a new `category` (from the default taxonomy or their team's `custom_categories`) for a news item, without an opportunity score
- **THEN** an override record is created or updated for that `(news_item, team)` pair with the new category, and the underlying `NewsItem.category` is unchanged

#### Scenario: Team member overrides opportunity score
- **WHEN** a team member submits a new `opportunity_score` for a news item
- **THEN** an override record is created or updated for that `(news_item, team)` pair with the new score, and the underlying `NewsItem.opportunity_score` is unchanged

#### Scenario: Team member clears an override
- **WHEN** a team member requests removal of their team's override for a news item that has one
- **THEN** the override record is deleted and subsequent reads by that team fall back to the shared `NewsItem`'s original `category`/`opportunity_score`

### Requirement: Only team members can override for their team
Setting, updating, or clearing an override for a given `team_id` SHALL be restricted to authenticated users who belong to that team, or global admins.

#### Scenario: Non-member attempts to override
- **WHEN** an authenticated user who is not a member of a team and is not an admin attempts to set an override for that team
- **THEN** the request is rejected as forbidden

### Requirement: Reads reflect the requesting team's override when present
When a news item is read (list or single) by an authenticated user, the response SHALL reflect that user's team's override (`category`, `opportunity_score`) if one exists for any of the user's teams, and SHALL flag the item as overridden.

#### Scenario: Override exists for requesting team
- **WHEN** a team member with an active override for a news item requests that item (directly or via the list endpoint)
- **THEN** the returned item's `category`/`opportunity_score` reflect the override values and the item includes `is_overridden: true`

#### Scenario: No override exists
- **WHEN** a user requests a news item for which their team has no override
- **THEN** the returned item reflects the shared `NewsItem`'s original `category`/`opportunity_score` and `is_overridden: false`

### Requirement: Feed exposes a recategorize control
The Feed UI SHALL let a user recategorize a displayed news item (choosing from their team's effective category set) or adjust its opportunity score, invoking the override endpoint.

#### Scenario: User recategorizes a card
- **WHEN** a user selects a different category for a news item from the Feed
- **THEN** the card immediately reflects the new category and an "overridden" indicator, and the change persists across page reloads for that user's team
