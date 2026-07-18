## Context

`Team.custom_categories` (`team.model.ts:20-21`) is a CRUD-managed override-label list — it only extends the vocabulary available when manually overriding a news item's category, and is validated for uniqueness/casing/length in `team.service.ts:103-136`. It does not influence what a team sees. The categorization LLM only ever assigns from the fixed taxonomy `NEWS_CATEGORIES = ['AI','Web Dev','Career','Security','DevOps','Other']` (`newsIngestion.interface.ts:13`).

The feed (`getAllNewsItems` in `newsItem.service.ts:54-75`) runs a `QueryBuilder` chain (`.search().filter().sort().paginate()`); an explicit `?category=` already flows through `.filter()`. `team_id` is stripped before filtering and resolved as `queryTeamId ?? requestingUser?.team_ids[0]`. `GET /news-items` is `optionalAuth`, so unauthenticated calls must keep exactly today's behavior.

The auto-generation job (`generatedContent.job.ts:12,40-55,95-98`) currently runs `NewsItem.find().sort({ opportunity_score: -1, trend_score: -1 }).limit(TOP_NEWS_PER_TEAM)` — global, unbounded age, identical for every team — then dedupes per-team via `GeneratedContent.exists({team_id, news_item_id})`.

## Goals / Non-Goals

**Goals:**
- Let a team restrict its feed to a subset of the fixed taxonomy, with empty meaning "no preference."
- Make the auto-generation job draft from each team's subscribed categories within a freshness window, fixing the "same top-3 forever" staleness bug as a natural side effect.
- Zero behavior change for teams that never opt in, and zero change for unauthenticated/no-team-context requests.

**Non-Goals:**
- Feed default sort or `lifecycle` filtering — owned by the retention plan (file 2); this change leaves a code-comment seam for it.
- Semantic/embedding-based interest ranking — deferred.
- Any change to `custom_categories`, the override-label feature.
- Frontend settings UI (separate plan, 8C) — this change is backend-only.

## Decisions

1. **New field `subscribed_categories`, not an overload of `custom_categories`.** `custom_categories` extends the assignable vocabulary (labels the LLM never assigns); subscriptions must be a *subset of the fixed taxonomy* the LLM does assign, or an unlucky value would silently filter a team's feed to zero. Two fields, two meanings, no migration.

2. **Empty array = all categories.** Default `[]`. Existing teams see no behavior change until an admin opts in; no backfill needed.

3. **Filter injection point in `getAllNewsItems`:** after the `QueryBuilder` chain is built, only when (a) a team context resolved, (b) the incoming query had no explicit `category`, and (c) the team's `subscribed_categories` is non-empty:
   ```ts
   newsItemQuery.modelQuery = newsItemQuery.modelQuery.find({ category: { $in: subscribed } });
   ```
   This mirrors the existing post-QueryBuilder narrowing pattern used for team scoping in `brandVoiceExample.service.ts:32-36`. `countTotal()` reads `modelQuery.getFilter()`, so pagination `meta.total` reflects the merged filter automatically. This costs one extra `Team.findById(teamId).select('subscribed_categories')` per feed request in v1 — no caching; acceptable at current scale. The lookup is wrapped in try/catch: a failure logs a warning and falls back to an unfiltered feed rather than 500ing the whole request.

4. **Explicit `category` always wins, by construction** — condition (b) above means the injected filter is simply never applied when the caller already asked for a specific category, so there is no contradiction/intersection logic to get wrong.

5. **Validation reuses the taxonomy constant as the single source of truth:** `subscribed_categories: z.array(z.enum(NEWS_CATEGORIES as unknown as [string, ...string[]])).max(NEWS_CATEGORIES.length).optional()` added to `updateTeamValidation`. The service dedupes before persisting (enum guarantees canonical casing, so a plain `Set` dedupe suffices — no case-insensitive comparison needed here, unlike `custom_categories`).

6. **`PATCH /teams/:teamId` stays admin-gated** — consistent with the existing `voice_profile` precedent on the same endpoint. RBAC is revisited only if requested separately.

7. **Auto-gen job query becomes per-team, category-scoped, and freshness-bounded:**
   ```ts
   NewsItem.find({
     ...(subscribed.length ? { category: { $in: subscribed } } : {}),
     created_at: { $gte: new Date(Date.now() - maxAgeHours * 3600 * 1000) },
     // lifecycle: 'active' — seam for the retention plan (file 2) to add later
   }).sort({ opportunity_score: -1, trend_score: -1 }).limit(TOP_NEWS_PER_TEAM)
   ```
   New env `AUTO_GENERATION_MAX_AGE_HOURS` (default `'72'`) → `config.auto_generation.max_age_hours`. Per-team dedupe (`GeneratedContent.exists`), the per-run LLM-call cap, and the brand-voice-examples gate are unchanged — only the candidate-selection query changes. The team query in the job widens its projection to `_id name subscribed_categories`.

8. **Capability placement:** `subscribed_categories` on `Team` and its validation/API surface is a new capability (`team-category-subscriptions`) distinct from the existing `team-category-taxonomy` capability (which owns `custom_categories`). The feed-filtering behavior is an **added** requirement on the existing `news-ingestion` capability (alongside its other `GET /news-items` requirements). The auto-gen selection-query change **modifies** the existing "Auto-generation job selects top-opportunity items per team" requirement under the existing `generated-content` capability.

9. **No caching, no new indexes.** `category` is already a plain field on `NewsItem`; no new index is introduced by this change (out of scope — revisit only if query plans show it's needed).

## Risks / Trade-offs

- **[Extra DB round-trip per feed request]** → one indexed `findById` on `Team`; wrapped in try/catch so a transient failure degrades to unfiltered rather than erroring. Acceptable at hackathon/demo scale; revisit with caching if it becomes a hot path.
- **[Silent zero-result feed if an admin subscribes to categories with no current items]** → matches spec intent (explicit `category` override still works to see everything); not treated as a bug.
- **[Job selection change could reduce draft volume for narrowly-subscribed teams]** → intended: precision over volume, consistent with the vision's "reach different teams according to their selected categories."

## Migration Plan

- No data migration: `subscribed_categories` defaults to `[]` at the schema level, so existing `Team` documents read as "all categories" without a backfill script.
- Deploy order: schema/validation → feed filter → job query, in one change (small enough not to need staged rollout). Rollback is a plain revert; no destructive schema change is introduced.

## Open Questions

None — scope and behavior are fully pinned by the plan's design decisions and verified baseline.
