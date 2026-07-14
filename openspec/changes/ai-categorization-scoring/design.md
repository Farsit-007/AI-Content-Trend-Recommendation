## Context

`NewsItem` documents are ingested once, globally, and shared across every team (`newsIngestion.service.ts` — no `team_id` on the pipeline or on `NewsItem` itself; this mirrors the pooled brand-voice relevance design). Categorization happens in `newsIngestion.categorize.ts`: one LLM call per batch returns `{ category, impact_note, opportunity_score }`, where `category` is forced into a fixed 6-value enum (`NEWS_CATEGORIES`) and `opportunity_score` is a number the LLM invents directly, with `relevance_score`/`trend_score` only given to it as *context* in the prompt, not as inputs to a formula it must follow.

`Team` (`team.model.ts`) currently has no category-related field. There's no per-team role system — access control today is either global (`role: admin|super_admin`) or team-membership (`requestingUser.team_ids.includes(team_id)`), established in `BrandVoiceExample`'s `assertTeamAccess` helper. This change reuses that exact pattern rather than inventing a new permission tier.

## Goals / Non-Goals

**Goals:**
- Make the categorization step self-report its own uncertainty instead of being trusted unconditionally.
- Make `opportunity_score` a reproducible function of the signals the pipeline already trusts (`relevance_score`, `trend_score`) plus one new bounded LLM judgment (`audience_fit`), rather than a free-form LLM guess.
- Let a team see news items through its own category taxonomy and correct mistakes, without forking the shared item or the shared ingestion pipeline.
- Reuse the existing team-membership access pattern (`assertTeamAccess`) rather than introducing new roles.

**Non-Goals:**
- Not re-running categorization per-team at ingestion time. Items stay a single pooled pool; the default taxonomy is what ingestion assigns.
- Not building a moderation queue/workflow UI for `needs_review` items — just a visible flag on the card, surfaced in the Feed. A dedicated review queue can be a follow-up.
- Not changing `trend_score` or `relevance_score` calculation — only how they feed into `opportunity_score`.
- Not adding per-team roles/permissions beyond the existing admin vs. team-member split.

## Decisions

### 1. Overrides live in a separate collection, not fields on `NewsItem`
A `NewsItemCategoryOverride` collection (`{ news_item_id, team_id, category, opportunity_score?, overridden_by, overridden_at }`, unique on `(news_item_id, team_id)`) sits alongside `NewsItem` rather than adding `team_overrides: Map<...>` to `NewsItem` itself.
- **Alternative considered**: embed a `team_overrides` array/map directly on `NewsItem`. Rejected — every read of a shared, high-volume, frequently-inserted collection would carry every team's override history, and `insertMany` in the ingestion pipeline (`newsIngestion.service.ts`) would need to special-case existing docs. A join-style collection keeps `NewsItem` writes (ingestion) and override writes (team correction) fully decoupled.
- Reads merge in application code: `getAllNewsItems`/`getSingleNewsItem` for an authenticated request look up overrides for the requesting team's `team_ids` and splice in `category`/`opportunity_score` where present, plus an `is_overridden: boolean` flag so the UI can distinguish "AI-assigned" from "team-corrected."

### 2. One override mechanism serves both "correction" and "apply my team's custom category"
Rather than building a separate "recategorize into my taxonomy" feature and a separate "flag as wrong" feature, both are the same write: `PATCH /news-items/:id/override` with `{ category }` and/or `{ opportunity_score }`, scoped by `team_id` via `assertTeamAccess`. Whether the new category comes from the fixed default list or the team's `custom_categories`, the write and read-merge path are identical.
- **Alternative considered**: separate `is_correction` vs `is_custom_label` semantics. Rejected as unnecessary complexity — from the system's perspective both are "this team's opinion overrides the pooled default," which is exactly what the override row represents.

### 3. `custom_categories` is a plain string array on `Team`, not its own collection
`Team.custom_categories: string[]`, managed via existing `Team` update path (or a small dedicated endpoint), following the simplicity of `Team`'s current shape (`team.model.ts` has no sub-collections yet).
- **Alternative considered**: a `TeamCategory` collection with metadata (color, created_by, etc.). Rejected for now — no requirement calls for per-category metadata beyond its label; a string array is enough for the taxonomy and keeps the read path (`effectiveCategories = NEWS_CATEGORIES + team.custom_categories`) a single field read.
- Validation: reject duplicates (case-insensitive) against `NEWS_CATEGORIES` and the team's existing list; cap list length (e.g., 20) to keep the Feed's category tabs usable.

### 4. `opportunity_score` formula: code-owned weights, LLM supplies one bounded input
```
opportunity_score = round1(
  W_RELEVANCE * (relevance_score ?? fallbackRelevance) +
  W_TREND     * trend_score +
  W_FIT       * (audience_fit * 10)
)
```
with `W_RELEVANCE + W_TREND + W_FIT = 1` (proposed defaults 0.4 / 0.3 / 0.3), all three weights and `fallbackRelevance` (used cold-start, when the brand-voice pool is empty and `relevance_score` is `undefined`) sourced from `config.news_ingestion`. The categorize LLM call's response contract changes from `opportunity_score: number` to `audience_fit: number` (0-1, "how well does this topic fit a growth/social content team's audience, independent of how trendy or on-brand it already scored"). `confidence` (0-1) is added alongside `category` in the same response object.
- **Alternative considered**: keep asking the LLM for `opportunity_score` directly but clamp/blend it with a formula-computed value. Rejected — blending two independently-scaled numbers (one arbitrary LLM guess, one derived) reintroduces the same inconsistency this change exists to remove; better to remove the LLM's ability to set the final number at all.
- **Trade-off accepted**: existing stored items keep whatever `opportunity_score` they were ingested with (no backfill) — only newly-ingested items get the formula-derived score. Acceptable since these are ephemeral, frequently-refreshed feed items, not durable records.

### 5. `needs_review` threshold is a static config value, not per-team
`config.news_ingestion.category_confidence_threshold` (proposed default 0.6). Below it, `needs_review: true` is stored on the `NewsItem` at ingestion time.
- **Alternative considered**: per-team thresholds. Rejected as unnecessary — this is a global signal about the shared item, not a team preference; keeping it global keeps `NewsItem` writes independent of any team's settings, consistent with Decision 1.

## Risks / Trade-offs

- **[Risk]** LLM may not reliably emit well-calibrated `confidence`/`audience_fit` values (LLMs are known to be overconfident). → **Mitigation**: same defensive parsing/fallback already in `newsIngestion.categorize.ts` (`fallbackCategorize`) extends to the new fields — missing/out-of-range values fall back to `confidence: 0` (forces `needs_review: true`, safe default) and `audience_fit` derived from `relevance_score` alone.
- **[Risk]** A team's override becomes stale if the underlying item is later re-scored (it won't be — items aren't re-ingested) or if `custom_categories` later removes a category an override references. → **Mitigation**: overrides store the category as a plain string, not a foreign key; the Feed UI falls back to displaying it as-is even if it's no longer in the team's active `custom_categories` list. Deleting a custom category does not cascade-delete overrides.
- **[Risk]** Merging overrides on every list read (`getAllNewsItems`) adds a query per request. → **Mitigation**: single `NewsItemCategoryOverride.find({ team_id, news_item_id: { $in: [...] } })` per page of results (one query, not N+1); acceptable at hackathon scale.
- **[Risk]** Changing the categorize LLM response contract (`opportunity_score` → `audience_fit`) is a breaking prompt change. → **Mitigation**: no external consumers of the LLM response shape exist outside `newsIngestion.categorize.ts`; it's fully internal, deployed atomically with the scoring change.

## Migration Plan

1. Add new optional fields to `NewsItem` (`category_confidence`, `needs_review`) and `Team` (`custom_categories`, default `[]`) — additive, no backfill required.
2. Deploy updated `newsIngestion.categorize.ts` (confidence + audience_fit) and `newsIngestion.scoring.ts` (formula) together — the next ingestion run (manual trigger or scheduled) starts producing the new fields.
3. Add `NewsItemCategoryOverride` collection/model and its endpoints; deploy independently of step 2 since it doesn't touch ingestion.
4. Ship frontend changes (dynamic categories, needs-review badge, recategorize control, admin taxonomy management) last, once the backend fields/endpoints exist.
- **Rollback**: every change is additive (new optional fields, new collection, new endpoints); reverting the frontend or backend independently is safe — old `NewsItem` documents and the existing fixed-category UI continue to work unchanged if any piece is rolled back.

## Open Questions

- Should `needs_review` items be excluded from the Feed by default (opt-in "show unreviewed") or shown with just a badge? Proposed: shown with a badge (matches the low-friction hackathon Feed), revisit if reviewers want stricter gating.
- Exact weight defaults (0.4/0.3/0.3) are a starting point, not a validated formula — worth a quick eyeball pass against a real ingestion run before demo day.
