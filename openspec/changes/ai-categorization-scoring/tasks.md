## 1. Config and data model

- [x] 1.1 Add `category_confidence_threshold`, `opportunity_weight_relevance`, `opportunity_weight_trend`, `opportunity_weight_fit`, and `opportunity_fallback_relevance` to `config/index.ts` (under `news_ingestion`), validating the three weights sum to 1
- [x] 1.2 Add `category_confidence?: number` and `needs_review: boolean` (default `false`) to `NewsItem/newsItem.interface.ts` and `.model.ts`
- [x] 1.3 Add `custom_categories: string[]` (default `[]`) to `Team/team.interface.ts` and `.model.ts`
- [x] 1.4 Create `NewsItemCategoryOverride` module: `newsItemCategoryOverride.interface.ts` (`news_item_id`, `team_id`, `category?`, `opportunity_score?`, `overridden_by`, `overridden_at`) and `.model.ts` with a unique index on `(news_item_id, team_id)`

## 2. Categorization + scoring pipeline changes

- [x] 2.1 Update the categorization LLM system prompt in `newsIngestion.categorize.ts` to request `confidence` (0-1) and `audience_fit` (0-1) instead of `opportunity_score`
- [x] 2.2 Update `LlmCategorization` interface and `parseLlmResponse`/batch-merge logic to validate and extract `confidence`/`audience_fit`, falling back to `confidence: 0` and `audience_fit` derived from `relevance_score` on missing/invalid values (mirroring existing `fallbackCategorize` behavior)
- [x] 2.3 Update `CategorizedNewsItem` (`newsIngestion.interface.ts`) to carry `category_confidence` and `audience_fit` instead of a raw `opportunity_score` from the LLM
- [x] 2.4 Add `computeOpportunityScore(relevance_score, trend_score, audience_fit, config)` to `newsIngestion.scoring.ts` implementing the weighted formula with the config-sourced weights and fallback relevance
- [x] 2.5 Wire `newsIngestion.service.ts` to call `computeOpportunityScore` after categorization and to compute `needs_review` from `category_confidence` vs. the configured threshold, before building `NewsItem` insert payloads
- [x] 2.6 Persist `category_confidence` and `needs_review` in the `NewsItem` insert payload

## 3. Team custom categories

- [x] 3.1 Add validation for adding a custom category: reject case-insensitive duplicates against `NEWS_CATEGORIES` and the team's existing `custom_categories`, enforce a max list length
- [x] 3.2 Add endpoints (or extend `Team` routes) to add/remove a team's custom category, gated by `assertTeamAccess`-style team-membership check (member of the team or admin)
- [x] 3.3 Add an endpoint to fetch a team's effective category set (defaults + `custom_categories`)

## 4. News item category override

- [x] 4.1 Create `newsItemCategoryOverride.service.ts`: `setOverride(newsItemId, teamId, { category?, opportunity_score? }, requestingUser)`, `clearOverride(newsItemId, teamId, requestingUser)`, both gated by team-membership
- [x] 4.2 Add `PATCH /news-items/:id/override` and `DELETE /news-items/:id/override` routes (auth required), validating `category` against the requesting team's effective category set when provided
- [x] 4.3 Update `NewsItemService.getAllNewsItems`/`getSingleNewsItem` to accept the requesting user's `team_ids`, batch-fetch matching overrides, and splice `category`/`opportunity_score`/`is_overridden` into the response without mutating stored documents
- [x] 4.4 Update `newsItem.controller.ts` to pass `req.user` through to the service calls above

_Implementation note: GET `/news-items` and `/news-items/:id` were previously fully public (no auth middleware at all). Added a new `optionalAuth` middleware (`middleware/auth.ts`) that attaches `req.user` when a valid bearer token is present but never rejects the request, so overrides can be merged in for signed-in users while the feed stays publicly readable for anonymous ones — this wasn't an explicit task but was required to make 4.3 possible without a breaking auth change._

## 5. Frontend: dynamic categories and review flag

- [x] 5.1 Replace the hardcoded `CATEGORIES` const in `components/feed/constants.ts` with a fetch of the viewing team's effective categories (defaults + custom), keeping a sane loading/default state
- [x] 5.2 Update `CategoryTabs.tsx` to render the dynamic category list
- [x] 5.3 Add a "Needs review" badge to `NewsCard.tsx` when `needs_review` is true
- [x] 5.4 Add an "Overridden" indicator to `NewsCard.tsx` when `is_overridden` is true

_Implementation note: the Feed page was still rendering purely from `MOCK_NEWS_ITEMS` (never wired to the real `/news-items` API), which none of tasks 5-6 could work against. Per user decision, wired the Feed to the real API as part of this group: added `lib/api/config.ts`, `lib/api/newsItems.ts`, `lib/api/teams.ts` (following the existing `auth_token`/`NEXT_PUBLIC_DEFAULT_TEAM_ID` convention from `ContentGenerator.tsx`), and converted `NewsFeed.tsx` into a self-fetching component with a loading skeleton. `MOCK_NEWS_ITEMS` / `lib/mock/news.ts` were kept in place per CLAUDE.md, just no longer used as the Feed's data source. Also added the shadcn `select` component (none of AI/Web Dev/etc. dropdown primitives existed yet) for the recategorize control used in group 6._

## 6. Frontend: recategorize control and admin taxonomy management

- [x] 6.1 Add a recategorize control to `NewsCard.tsx` (e.g. a dropdown of the team's effective categories) that calls `PATCH /news-items/:id/override` and optimistically updates the card
- [x] 6.2 Add a way to adjust a card's opportunity score inline, calling the same override endpoint
- [x] 6.3 Add a "Manage Categories" section to `components/admin/AdminPanel.tsx` for adding/removing the current team's custom categories

## 7. Verification

- [ ] 7.1 Run a manual ingestion trigger and confirm new `NewsItem` documents include `category_confidence`, `needs_review`, and an `opportunity_score` matching the formula given their `relevance_score`/`trend_score`
- [ ] 7.2 Verify a team can add a custom category, recategorize a news item into it, and see the override reflected on reload; verify another team does not see that override
- [ ] 7.3 Verify clearing an override reverts the item to its original AI-assigned category/score
