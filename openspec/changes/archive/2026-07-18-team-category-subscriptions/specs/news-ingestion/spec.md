## ADDED Requirements

### Requirement: Subscription-Filtered Feed
When `GET /news-items` executes with a team context (explicit `team_id` query or the requesting user's first team) whose `subscribed_categories` is non-empty and the request carries no explicit `category` filter, the result set and its pagination metadata SHALL include only items whose category is in the subscribed set. An explicit `category` query parameter SHALL bypass the subscription filter entirely. Requests with no team context SHALL behave exactly as before this requirement.

#### Scenario: Feed honors subscriptions
- **WHEN** a member of a team subscribed to `["AI"]` lists news items without a category param
- **THEN** every returned item has category `AI` and `meta.total` counts only such items

#### Scenario: Explicit category overrides subscriptions
- **WHEN** the same member requests `?category=Security`
- **THEN** Security items are returned even though Security is not subscribed

#### Scenario: Unauthenticated feed unchanged
- **WHEN** an unauthenticated caller lists news items
- **THEN** no subscription filtering occurs

#### Scenario: Empty subscriptions mean everything
- **WHEN** the team's `subscribed_categories` is empty
- **THEN** the feed is identical to the pre-change behavior

#### Scenario: Team lookup failure degrades gracefully
- **WHEN** the team lookup used to resolve `subscribed_categories` fails unexpectedly
- **THEN** the feed request still succeeds and returns the unfiltered result set
