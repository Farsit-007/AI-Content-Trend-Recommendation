## Why

Resources should reach "different team according to their selected categories" (vision V2), but today `Team.custom_categories` only extends the override-label vocabulary — nothing filters the feed by team preference, and the auto-generation job drafts from the *global* all-time top-3 news items with no category or age filter, so the same items stay eligible forever and every team gets identical drafts regardless of interest.

## What Changes

- `Team` gains `subscribed_categories: string[]`, restricted to the fixed assignable taxonomy (`AI`, `Web Dev`, `Career`, `Security`, `DevOps`, `Other`), defaulting to `[]` ("subscribed to everything" — zero behavior change for existing teams until they opt in). `custom_categories` is untouched.
- `PATCH /teams/:teamId` (admin-gated, existing endpoint) accepts `subscribed_categories`.
- `GET /news-items` auto-applies `category ∈ subscribed_categories` whenever a team context resolves and the request carries no explicit `?category=`; an explicit `category` param always bypasses the filter; unauthenticated/no-team requests are unchanged.
- The auto-generation job stops drafting from the global all-time top-3: per team it now selects top news items from that team's subscribed categories (all categories when empty) within a new freshness window (`AUTO_GENERATION_MAX_AGE_HOURS`, default 72h), fixing the "same 3 items forever" staleness bug as a side effect.

## Capabilities

### New Capabilities
- `team-category-subscriptions`: teams can set and read an editable subset of the fixed news taxonomy that shapes what they see, distinct from the unrelated `custom_categories` override-label feature.

### Modified Capabilities
- `news-ingestion`: `GET /news-items` gains subscription-based category filtering (new requirement; existing search/filter/sort/paginate behavior otherwise unchanged).
- `generated-content`: the "Auto-generation job selects top-opportunity items per team" requirement is modified to select per-team, per-subscribed-category, freshness-windowed items instead of global all-time top-N.

## Impact

- Backend: `team.interface.ts`, `team.model.ts`, `team.validation.ts`, `team.service.ts`, `docs/schemas.ts`, `newsItem.service.ts` (`getAllNewsItems`), `generatedContent.job.ts`, `config/index.ts` (new `AUTO_GENERATION_MAX_AGE_HOURS`).
- No frontend changes (settings UI for this field is a separate, later plan).
- No migration/backfill; no change to feed default sort or lifecycle filtering (owned by the retention plan).
