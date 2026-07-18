## MODIFIED Requirements

### Requirement: Auto-generation job selects top-opportunity items per team
The job SHALL: (1) iterate all teams that have ≥1 `brand_voice_example`; (2) for each team, fetch the top-N news items by `opportunity_score` descending then `trend_score` descending, restricted to that team's `subscribed_categories` (all categories when the subscription set is empty) and to items created within a configurable freshness window (`AUTO_GENERATION_MAX_AGE_HOURS`, default 72 hours), N defaulting to 3; (3) skip items already drafted for that team; (4) call `ContentGenerationService.generateContent()` for remaining items; (5) respect a global cap of `AUTO_GENERATION_MAX_PER_RUN` LLM calls per job run (default 10); (6) wrap each team in try/catch so one failure does not abort the rest.

#### Scenario: Team with brand voice examples gets drafts
- **WHEN** a team has ≥1 brand voice example and 3 fresh, subscribed-category, undrafted top-opportunity news items
- **THEN** 3 drafts are created for that team

#### Scenario: Cold-start team is skipped
- **WHEN** a team has zero brand voice examples
- **THEN** no drafts are created for that team and the job logs the skip

#### Scenario: Quota cap stops generation mid-run
- **WHEN** `AUTO_GENERATION_MAX_PER_RUN` is 5 and there are 10 items to generate across teams
- **THEN** exactly 5 drafts are created and the job stops without error

#### Scenario: Team gets category-matched drafts
- **WHEN** the job runs for a team subscribed to `["AI"]` while fresh items exist in both `AI` and `DevOps`
- **THEN** drafts are created only from the fresh `AI` items

#### Scenario: Stale items never drafted
- **WHEN** the only high-opportunity items for a team's subscribed categories are older than the freshness window
- **THEN** the job creates no drafts for them

#### Scenario: Unsubscribed team still gets top items
- **WHEN** a team's `subscribed_categories` is empty
- **THEN** the job selects its top-N fresh items across all categories, unchanged from selecting without a category restriction
