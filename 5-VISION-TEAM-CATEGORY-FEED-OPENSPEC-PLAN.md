# 5 — Team Category Subscriptions & Personalized Feed: OpenSpec Execution Plan

**Problem (V2 in the vision):** Resources should reach "different team according to their selected categories." Today `Team.custom_categories` is a CRUD-managed label list used only to validate per-item category overrides — **nothing filters the feed by team preference**, and the auto-generation job drafts from the *global* top-3 news items with no category or age filter (so the same all-time-top items stay eligible forever).
**Parent analysis:** [VISION-ALIGNMENT-DEEP-ANALYSIS.md](./VISION-ALIGNMENT-DEEP-ANALYSIS.md) §4 V2 (gap), §6 Phase C (design).
**Sibling plans:** [2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md](./2-FARSIT-NEWS-RETENTION-OPENSPEC-PLAN.md) owns the feed's *default sort* fix and future `lifecycle` filter — this plan deliberately does **not** touch sorting or lifecycle. [8-VISION-FRONTEND-EXPERIENCE-OPENSPEC-PLAN.md](./8-VISION-FRONTEND-EXPERIENCE-OPENSPEC-PLAN.md) Change 8C builds the settings UI for the field added here.
**Global sequence position:** change **5A**; no dependencies; can run in parallel with everything else. See file 4 §Global sequence for the full map.
**Date:** 2026-07-17

> **Execution protocol:** `/opsx:propose` (feed Proposal input + Design decisions + Spec delta + Tasks) → `/opsx:apply` → Verification → `/opsx:archive`.

---

## 0. Verified baseline (re-checked 2026-07-17)

| Fact | Location |
|---|---|
| `Team` schema: `custom_categories: [String]` (override-label feature, max 20, case-insensitive dupe check) — **keep as-is, do not overload**; `voice_profile` subdoc | `team.model.ts:20-21`, `team.service.ts:103-136` |
| Fixed taxonomy the categorization LLM can assign: `NEWS_CATEGORIES = ['AI','Web Dev','Career','Security','DevOps','Other']` — already imported by TeamService | `newsIngestion.interface.ts:13`, `team.service.ts:5` |
| `updateTeam` service accepts only `Partial<Pick<ITeam, 'name'|'description'|'voice_profile'>>` — a new field must be added to this Pick **and** to `updateTeamValidation` | `team.service.ts:54-63`, `team.validation.ts:13-24` |
| `PATCH /teams/:teamId` is `requireAdmin`-gated | `team.route.ts:16-21` |
| Feed: `getAllNewsItems(query, requestingUser)` — QueryBuilder `.search().filter().sort().paginate()`; `team_id` is stripped from the query before filtering; team context resolves as `queryTeamId ?? requestingUser?.team_ids[0]`; an explicit `?category=` flows through `.filter()` into the Mongo find | `newsItem.service.ts:54-75`, `builder/QueryBuilder.ts:28-55` |
| Post-QueryBuilder narrowing pattern to copy (append a second `.find()` on `modelQuery`): brand-voice list does exactly this for team scoping | `brandVoiceExample.service.ts:32-36` |
| `countTotal()` reads `modelQuery.getFilter()` — a second `.find()` merged before execution is reflected in meta counts | `QueryBuilder.ts:71-77` |
| `GET /news-items` is `optionalAuth` — unauthenticated calls have no user and must keep today's global behavior | `newsItem.route.ts:37` |
| Auto-gen job: `NewsItem.find().sort({ opportunity_score: -1, trend_score: -1 }).limit(TOP_NEWS_PER_TEAM)` — **no category filter, no age filter**, `TOP_NEWS_PER_TEAM = 3`, per-team dedupe via `GeneratedContent.exists({team_id, news_item_id})`, run cap `config.auto_generation.max_per_run` | `generatedContent.job.ts:12, 40-55, 95-98` |
| Job selects `_id title category impact_note` only — adding `category` to the *filter* needs no projection change | `generatedContent.job.ts:43` |
| Env config pattern for the job: `AUTO_GENERATION_CRON` / `AUTO_GENERATION_MAX_PER_RUN` under `config.auto_generation` | `config/index.ts:112-114, 207-210` |
| Team integration tests exist and cover `custom_categories` + `voice_profile` PATCH — the pattern to extend | `__tests__/team.integration.test.ts` |
| No test file exists for `generatedContent.job` — the job is LLM-backed but fully mockable via `jest.mock('../app/lib/openrouterClient')` + `support/openrouterMock` | `__tests__/` listing, `support/openrouterMock.ts` |
| `created_at` (not `createdAt`) is the NewsItem timestamp field | `newsItem.model.ts:33` |

**Non-goals:** feed default *sort* (owned by retention plan, file 2); `lifecycle` filtering (same); custom-category semantic matching (embedding-based interest ranking — deferred, noted in parent analysis §6 C5); any frontend (file 8C).

---

## Change 5A — `team-category-subscriptions`

### Proposal input (for `/opsx:propose`)
> Give teams category subscriptions that actually shape what they see. `Team` gains `subscribed_categories: string[]` (values restricted to the fixed `NEWS_CATEGORIES` taxonomy; empty array = subscribed to everything, the default). `PATCH /teams/:teamId` accepts it. `GET /news-items` auto-applies `category ∈ subscribed` whenever a team context is present (explicit `?category=` always wins; unauthenticated/global requests unchanged). The auto-generation job stops drafting from the global all-time top-3: per team it now selects top news among that team's subscribed categories within a freshness window (`AUTO_GENERATION_MAX_AGE_HOURS`, default 72). `custom_categories` (the override-label feature) is intentionally untouched.

### Design decisions
1. **New field, not `custom_categories`.** `custom_categories` extends the override vocabulary (labels the LLM never assigns); subscriptions must be a **subset of the assignable taxonomy** or they'd filter the feed to zero. Two fields, two meanings, zero migration risk.
2. **Empty = all.** Default `[]` means "no preference → whole feed," so existing teams see zero behavior change until someone opts in. No backfill.
3. **Filter injection point:** in `getAllNewsItems`, after the QueryBuilder chain is constructed and only when (a) a team context resolved, (b) the incoming query had **no** explicit `category`, and (c) the team's `subscribed_categories` is non-empty → `newsItemQuery.modelQuery = newsItemQuery.modelQuery.find({ category: { $in: subscribed } })` (the `brandVoiceExample.service.ts:32-36` pattern; meta counts stay correct because `countTotal()` reads the merged filter). One extra `Team.findById(teamId).select('subscribed_categories')` per feed request — acceptable; no caching in v1.
4. **Explicit override wins by construction:** when `?category=` is present the auto-filter is skipped entirely (condition b), so a user browsing another tab is never double-filtered into a contradiction.
5. **Validation:** `subscribed_categories: z.array(z.enum(NEWS_CATEGORIES)).max(NEWS_CATEGORIES.length).optional()` in `updateTeamValidation` (import the const — single source of truth), service dedupes case-sensitively (enum guarantees canonical casing). `updateTeam`'s `Pick` gains the field.
6. **Admin-gated PATCH stays.** Consistent with `voice_profile` precedent; the 8C settings UI hides the save control for non-admins. Revisit RBAC only if the team asks.
7. **Auto-gen query becomes per-team and fresh:** `NewsItem.find({ ...(subscribed.length ? { category: { $in: subscribed } } : {}), created_at: { $gte: new Date(Date.now() - maxAgeHours*3600*1000) } }).sort({ opportunity_score: -1, trend_score: -1 }).limit(TOP_NEWS_PER_TEAM)`. New env `AUTO_GENERATION_MAX_AGE_HOURS` default `'72'` under `config.auto_generation.max_age_hours`. This kills the "same 3 items forever" bug as a side effect (items age out of eligibility). When the retention plan later adds `lifecycle`, it owns adding `lifecycle: 'active'` here — leave a code comment marking the seam.
8. **`GET /teams/:teamId` needs no change** — the field rides along via the model. `docs/schemas.ts` team schema gains the property.

### Spec delta (capability `team-personalization`)

## ADDED Requirements

### Requirement: Team Category Subscriptions
A team SHALL have `subscribed_categories`, an editable subset of the fixed news taxonomy (`AI`, `Web Dev`, `Career`, `Security`, `DevOps`, `Other`), defaulting to empty meaning "all categories." Values outside the fixed taxonomy SHALL be rejected with a validation error. The existing `custom_categories` feature SHALL be unaffected.

#### Scenario: Admin sets subscriptions
- **WHEN** an admin PATCHes a team with `subscribed_categories: ["AI", "Web Dev"]`
- **THEN** the team document stores exactly those values and subsequent team reads include them

#### Scenario: Invalid category rejected
- **WHEN** a PATCH includes `subscribed_categories: ["Robotics"]`
- **THEN** the request fails validation with HTTP 400 and the team is unchanged

### Requirement: Subscription-Filtered Feed
When `GET /news-items` executes with a team context (explicit `team_id` query or the requesting user's first team) whose `subscribed_categories` is non-empty and the request carries no explicit `category` filter, the result set and its pagination metadata SHALL include only items whose category is in the subscribed set. An explicit `category` query parameter SHALL bypass the subscription filter entirely. Requests with no team context SHALL behave exactly as before.

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

## MODIFIED Requirements

### Requirement: Auto-Generation Draws From Team-Relevant Fresh News
The auto-generation job SHALL select, per team, the top news items by opportunity then trend score **from that team's subscribed categories (all categories when the subscription set is empty) and within a configurable freshness window** (`AUTO_GENERATION_MAX_AGE_HOURS`, default 72), replacing the previous global, unbounded-age top-N selection. Per-team draft dedupe, the per-run call cap, and the brand-voice-examples gate SHALL be unchanged.

#### Scenario: Team gets category-matched drafts
- **WHEN** the job runs for a team subscribed to `["AI"]` while fresh items exist in `AI` and `DevOps`
- **THEN** drafts are created only from the fresh `AI` items

#### Scenario: Stale items never drafted
- **WHEN** the only high-opportunity items are older than the freshness window
- **THEN** the job creates no drafts for them

### Tasks
1. **Model & validation**
   - [ ] 1.1 `team.interface.ts`: add `subscribed_categories: string[]` to `ITeam`
   - [ ] 1.2 `team.model.ts`: `subscribed_categories: { type: [String], default: [] }`
   - [ ] 1.3 `team.validation.ts`: import `NEWS_CATEGORIES`; add `subscribed_categories: z.array(z.enum(NEWS_CATEGORIES)).optional()` to `updateTeamValidation` (zod enum needs the tuple: `z.enum(NEWS_CATEGORIES as unknown as [string, ...string[]])` or a typed cast consistent with repo lint rules)
   - [ ] 1.4 `team.service.ts`: widen `updateTeam`'s payload type to include `subscribed_categories`; dedupe values before persisting
   - [ ] 1.5 `docs/schemas.ts`: team schema gains the array property
2. **Feed filtering**
   - [ ] 2.1 `newsItem.service.ts` `getAllNewsItems`: implement §Design-3 — load team subscriptions when team context exists and query had no `category`; append `$in` narrowing to `modelQuery`; wrap the team lookup in try/catch (lookup failure → unfiltered feed, log warn)
3. **Auto-generation job**
   - [ ] 3.1 `config/index.ts`: `AUTO_GENERATION_MAX_AGE_HOURS` default `'72'` → `config.auto_generation.max_age_hours`
   - [ ] 3.2 `generatedContent.job.ts`: teams query now selects `_id name subscribed_categories`; per-team news query per §Design-7 with the lifecycle seam comment
4. **Tests**
   - [ ] 4.1 `team.integration.test.ts`: PATCH sets subscriptions; invalid value → 400; response includes field
   - [ ] 4.2 `newsItem.integration.test.ts`: seed items in two categories; member of subscribed team → filtered list + correct meta.total; explicit `?category=` overrides; unauthenticated request unfiltered; empty-subscription team unfiltered
   - [ ] 4.3 New `generatedContent.job.integration.test.ts` (mock openrouter): team with brand-voice example + subscription `["AI"]`; seed fresh AI item, fresh DevOps item, stale AI item (created_at 100h ago) → `POST /generated-content/run` creates exactly one draft, for the fresh AI item
5. - [ ] 5.1 `cd backend && npm test && npm run build`

### Verification
- `npm test` + `npm run build` clean.
- Live: PATCH a real team to `["AI"]` → `GET /news-items?team_id=<id>` returns only AI items and `meta.total` shrinks accordingly; `?category=Web Dev` still works; unauthenticated `GET /news-items` unchanged.
- Trigger `POST /generated-content/run` for that team (after seeding a brand-voice example) and confirm in logs/drafts that only fresh, subscribed-category items were drafted.
- **Definition of done:** two teams with different subscriptions demonstrably see different feeds from the same corpus, and the auto-gen job's picks change per team accordingly.
