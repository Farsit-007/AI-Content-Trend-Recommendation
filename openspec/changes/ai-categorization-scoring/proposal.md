## Why

The news ingestion pipeline's categorization/scoring layer (`NewsIngestion/newsIngestion.categorize.ts`) works but has three gaps that limit its usefulness across teams: every team is stuck with the same fixed 6-category taxonomy, the LLM's category call is trusted blindly even when it's a low-confidence guess, there's no way for a user to fix a wrong category or score, and `opportunity_score` is picked freely by the LLM (0-10) instead of being tied to the `relevance_score`/`trend_score` signals the pipeline already computes — so two items with identical relevance and trend numbers can get wildly different opportunity scores depending on LLM mood. Growth Studio serves multiple teams with different content niches (`Team`), so a fixed global taxonomy and an unreviewable, unaccountable score undermine the "on-brand content ideas" pitch.

## What Changes

- Add a `confidence` field (0-1) to the categorization LLM call and response; persist it on `NewsItem` as `category_confidence`. Items below a configurable threshold are flagged `needs_review: true` instead of being silently trusted.
- Replace the freely-chosen `opportunity_score` with a deterministic formula computed in code from `relevance_score`, `trend_score`, and a new bounded `audience_fit` (0-1) signal from the LLM — the LLM stops inventing the final number and only judges topical fit; the pipeline combines the three into `opportunity_score` using fixed, configurable weights.
- Let each `Team` define custom categories in addition to the fixed default taxonomy (AI/Web Dev/Career/Security/DevOps/Other). The default taxonomy still drives ingestion-time categorization (items are shared/pooled across teams, so ingestion can't categorize into one team's private taxonomy); custom categories become available for that team to apply via override (see next point).
- Add a per-team category/score override: a team member can recategorize a `NewsItem` (into a default or their team's custom category) or adjust its `opportunity_score` for their own team's view, without mutating the shared item or affecting other teams. This is the same mechanism whether the reason is "the AI got it wrong" or "we want to see this under our own custom label."
- Feed UI reads the effective category/score for the viewing team (override if present, else the global AI-assigned value), shows a "needs review" indicator for low-confidence items, and gets a recategorize control. Admin panel gets a "Manage Categories" section for editing a team's custom taxonomy.

## Capabilities

### New Capabilities
- `news-categorization-confidence`: LLM categorization returns and persists a confidence score; low-confidence items are flagged for review.
- `opportunity-score-formula`: deterministic, configurable-weight combination of relevance/trend/audience-fit replaces free-form LLM scoring.
- `team-category-taxonomy`: teams can define custom categories on top of the fixed default set.
- `news-item-category-override`: team-scoped override of a news item's category and opportunity score, used both for corrections and for applying a team's custom taxonomy.

### Modified Capabilities
- None. The existing news ingestion pipeline capability was never synced into `openspec/specs/` (this repo's specs directory is currently empty), so there is no existing delta spec to modify — the capabilities above are additive on top of that implementation.

## Impact

- **Backend, modified**: `NewsIngestion/newsIngestion.categorize.ts` (confidence + audience_fit in LLM contract), `NewsIngestion/newsIngestion.scoring.ts` (opportunity_score formula), `NewsIngestion/newsIngestion.service.ts` (wire the new scoring step), `NewsIngestion/newsIngestion.interface.ts` (new fields), `NewsItem/newsItem.interface.ts` + `.model.ts` (`category_confidence`, `needs_review`), `Team/team.interface.ts` + `.model.ts` (`custom_categories: string[]`), `config/index.ts` (new tunables: review threshold, score weights).
- **Backend, new**: `NewsItemCategoryOverride` model/collection (`team_id`, `news_item_id`, `category`, `opportunity_score`, `overridden_by`, `overridden_at`), a service to merge overrides into `NewsItem` reads for the requesting team, endpoint(s) for setting/clearing an override and for managing a team's custom categories.
- **Frontend, modified**: `components/feed/constants.ts` (categories become team-dependent, not a static const), `components/feed/CategoryTabs.tsx`, `components/feed/NewsCard.tsx` (needs-review indicator + recategorize control), `components/admin/AdminPanel.tsx` (Manage Categories section).
- **No breaking changes** to existing stored `NewsItem` documents — all new fields are additive/optional; items without an override keep behaving exactly as they do today.
