## 1. Model & validation

- [x] 1.1 `team.interface.ts`: add `subscribed_categories: string[]` to `ITeam`
- [x] 1.2 `team.model.ts`: `subscribed_categories: { type: [String], default: [] }`
- [x] 1.3 `team.validation.ts`: import `NEWS_CATEGORIES`; add `subscribed_categories: z.array(z.enum(NEWS_CATEGORIES as unknown as [string, ...string[]])).max(NEWS_CATEGORIES.length).optional()` to `updateTeamValidation`
- [x] 1.4 `team.service.ts`: widen `updateTeam`'s payload type (`Partial<Pick<ITeam, 'name'|'description'|'voice_profile'|'subscribed_categories'>>`) to include `subscribed_categories`; dedupe values before persisting
- [x] 1.5 `docs/schemas.ts`: team schema gains the `subscribed_categories` array property

## 2. Feed filtering

- [x] 2.1 `newsItem.service.ts` `getAllNewsItems`: after the `QueryBuilder` chain is constructed, when a team context resolved and the incoming query had no explicit `category`, load `Team.findById(teamId).select('subscribed_categories')` (wrapped in try/catch — lookup failure logs a warn and falls through to the unfiltered feed) and, if non-empty, append `newsItemQuery.modelQuery = newsItemQuery.modelQuery.find({ category: { $in: subscribed } })` before execution

## 3. Auto-generation job

- [x] 3.1 `config/index.ts`: add `AUTO_GENERATION_MAX_AGE_HOURS` (zod string, default `'72'`) → `config.auto_generation.max_age_hours: Number(...)`
- [x] 3.2 `generatedContent.job.ts`: widen the teams query to select `_id name subscribed_categories`; change the per-team news query to `NewsItem.find({ ...(subscribed.length ? { category: { $in: subscribed } } : {}), created_at: { $gte: new Date(Date.now() - maxAgeHours*3600*1000) } }).sort({ opportunity_score: -1, trend_score: -1 }).limit(TOP_NEWS_PER_TEAM)`; add a code comment marking the `lifecycle: 'active'` seam for the retention plan

## 4. Tests

- [x] 4.1 `team.integration.test.ts`: PATCH sets `subscribed_categories`; invalid value → 400 and team unchanged; response includes the field; `custom_categories` unaffected by the same PATCH
- [x] 4.2 `newsItem.integration.test.ts`: seed items in two categories; member of a team subscribed to one category → filtered list + correct `meta.total`; explicit `?category=` overrides subscription; unauthenticated request unfiltered; empty-subscription team unfiltered
- [x] 4.3 New `generatedContent.job.integration.test.ts` (mock openrouter): team with a brand-voice example and subscription `["AI"]`; seed a fresh `AI` item, a fresh `DevOps` item, and a stale `AI` item (`created_at` 100h ago) → running the job creates exactly one draft, for the fresh `AI` item; a team with empty `subscribed_categories` still gets its top-N across all categories

## 5. Verification

- [x] 5.1 `cd backend && npm test && npm run build`
