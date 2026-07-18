## 1. Global category taxonomy: data model + seed

- [x] 1.1 New model `NewsCategoryTaxonomy` (or similar name), collection e.g. `news_categories`:
      `{ name, normalized_key (unique index), broad_group, source: 'seed' | 'ingestion', created_at }`.
- [x] 1.2 `newsItem.model.ts`: add `category_group?: string` alongside existing `category` (both
      indexed, since the feed query now filters on both).
- [x] 1.3 Seed script: idempotently insert the fixed six (`NEWS_CATEGORIES`) with `broad_group` =
      themselves, `source: 'seed'`. `npm run seed:news-categories`, plus wired into `server.ts` boot
      (alongside `seedSuperAdminIfMissing`/`seedDemoAccountsIfMissing`) so it's never forgotten in
      any deployment. Test suite's shared `connectTestDb`/`clearTestDb` helpers also seed it, since
      tests never run the real boot sequence — needed once `subscribed_categories` validation
      started checking the live taxonomy (found this the hard way: 3 pre-existing tests failed
      until this was added, see §7 below).
- [x] 1.4 Backfill script: set `category_group = category` on every existing `NewsItem` (trivial,
      since all existing categories are already one of the fixed six). `npm run
      backfill:category-group` — **not run against the live database in this pass** (no existing
      `NewsItem` documents in this deployment's real data needed it verified beforehand; run it
      before/alongside deploying if the live collection has pre-existing data).

## 2. Categorization: taxonomy-grounded prompt + normalization + dedup

- [x] 2.1 `newsIngestion.categorize.ts`: fetch the current known-category list before each batch;
      include it in the system prompt, instructing the model to reuse an existing category when it
      reasonably fits, and to propose a new one (with its broad group) only when none do.
      Implemented as fetched once per `categorizeBatch` call (per ingestion run), not once per
      batch — see the code comment for why that's an acceptable, documented tradeoff.
- [x] 2.2 Add a normalization step: on a proposed category not exactly matching a known
      `normalized_key`, check case/whitespace-normalized equality against existing entries before
      treating it as genuinely new; reuse the canonical entry's exact `name` if a normalized match
      exists.
- [x] 2.3 On a genuinely new category, upsert it into the taxonomy collection (unique index on
      `normalized_key` guards a race between concurrent batches proposing the same new category).
- [x] 2.4 Assign `category_group` on every categorized item (self, for a fixed-six category; the
      taxonomy entry's `broad_group`, for a discovered one) and include it in the insert payload in
      `newsIngestion.service.ts` (the same explicit, spread-free `payloads` map this pipeline
      already uses — a new field must be added there explicitly or it's silently dropped, per this
      codebase's own established gotcha from `news-source-link-and-thumbnail-fields`).
- [x] 2.5 Unit tests: exact-duplicate proposal reuses the canonical entry; case/whitespace-variant
      proposal reuses the canonical entry; genuinely new proposal creates a new taxonomy entry with
      the correct `broad_group`. `newsIngestion.categorize.test.ts` — 9/9 passing (6 new tests,
      including an invalid-broad-group fallback and a malformed-response fallback case beyond what
      was originally scoped).

## 3. Ingestion: remove the storage relevance gate

- [x] 3.1 `newsIngestion.service.ts`: delete the `relevant = brandVoicePool.length === 0 ? scored :
      scored.filter(...)` gate — `relevant = scored` unconditionally. Keep `relevance_score`/
      `opportunity_score` computation and storage completely unchanged.
- [x] 3.2 Add a separate, explicitly-named threshold for content enrichment (Layer 3b) so it doesn't
      inherit an unbounded item count — e.g. skip enrichment for items below a configurable
      opportunity/relevance floor, tuned independently of the (now-removed) storage gate.
      `NEWS_CONTENT_FETCH_MIN_RELEVANCE` (default 4.0, same scale/default as the old storage gate),
      replacing the now-fully-unused `NEWS_INGESTION_MIN_RELEVANCE` (removed rather than left dead).
- [x] 3.3 Update/rewrite the existing ingestion integration tests that asserted the old
      relevance-gated storage behavior to assert the new "store everything" behavior instead. (No
      existing test asserted the old gate's behavior directly, so nothing needed rewriting — full
      suite already passed unmodified after the gate's removal, confirmed by an unrelated-changes
      full run before writing any new tests.)
- [x] 3.4 Add a regression test: an item with a low `relevance_score` is stored (previously it would
      have been dropped), and its `relevance_score` is still correctly present.
      `newsIngestion.runObservability.test.ts` — 3 new tests (store-despite-low-relevance,
      enrich-when-high-relevance, skip-enrichment-when-low-relevance-but-still-store), 15/15 passing.

## 4. Team subscription: relax validation, expose the full taxonomy

- [x] 4.1 `team.validation.ts`: replace the fixed `z.enum(NEWS_CATEGORIES)` on
      `subscribed_categories` with a check against the live taxonomy's known names (async
      refinement, or a service-layer check before the Team update if zod's sync validation can't
      easily query the DB — implementation detail to resolve at build time). Implemented as an
      async zod `.refine()` — the `validation` middleware already awaits `schema.parseAsync`, so no
      further plumbing was needed.
- [x] 4.2 `team.service.ts::getEffectiveCategories`: include the full taxonomy (fixed + discovered),
      not just `NEWS_CATEGORIES`, alongside the team's own `custom_categories`. `addCustomCategory`'s
      duplicate-name check extended the same way for consistency.
- [x] 4.3 Tests: a team can successfully subscribe to a discovered (non-fixed-six) category;
      subscribing to a name that has never existed in the taxonomy is still rejected.
      `team.integration.test.ts` — 3 new tests (subscribe to discovered category, reject
      never-existed name, `GET /teams/:id/categories` includes a discovered category), 19/19 passing.

## 5. Feed matching: broad-group fallback + bounded semantic tier

- [x] 5.1 `newsItem.service.ts::getAllNewsItems`: extend the category filter to
      `category IN subscribed_categories OR category_group IN subscribed_categories`.
- [x] 5.2 Add the semantic "nearly relevant" tier: for a ready team, additionally include items not
      caught by the exact/group match whose `$vectorSearch` similarity against the team's pooled
      brand-voice-example embeddings exceeds a configured floor (new config,
      `NEWS_FEED_SEMANTIC_MATCH_THRESHOLD`). Distinguish these in the response via a `match_reason`
      field so the frontend can label them if desired. Implemented as a new, isolated
      `newsItem.semanticMatch.ts` module (`findSemanticallyRelevantItems`) — one `$vectorSearch`
      query per team brand-voice example (capped at 5), merged by best score, mirroring
      `scoreRelevance`'s existing "max similarity across the pool" semantics rather than diluting
      distinct topics into one averaged vector. Wired into `getAllNewsItems`: only fills the
      remaining room below the page's `limit` (never displaces an exact/group match), wrapped in a
      try/catch that falls back to exact/group-only results on any error (e.g. the Atlas index not
      existing yet on a given deployment), and gated behind `NEWS_FEED_SEMANTIC_MATCH_ENABLED`
      (**off by default** — mirrors this codebase's existing `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY`
      "ready but inactive" pattern; do not enable without first confirming
      `news_items_vector_index` actually exists on the target cluster via `npm run
      db:verify-indexes`, since this environment has no way to confirm that from here).
- [x] 5.3 Tests: broad-group fallback surfaces a fine-grained item under a subscribed group; an
      unsubscribed, unrelated category is excluded; a semantically close item outside both
      exact/group match is included, and a dissimilar one is not. All covered —
      `newsItem.integration.test.ts` (8 new tests: 3 broad-group + 5 semantic-tier, mocking
      `findSemanticallyRelevantItems` since real `$vectorSearch` has no equivalent in
      `mongodb-memory-server`, this suite's test database — Atlas Vector Search is Atlas-only
      infrastructure); `newsItem.semanticMatch.test.ts` (2 new tests covering the module's two
      testable early-return paths without a live index). 28/28 passing across both files.

## 6. Frontend: category subscription UI for a growing list

- [x] 6.1 `CategorySubscriptionsSection.tsx`: replace the fixed 6-checkbox layout with one that
      scales (e.g. grouped-by-broad-group, searchable/filterable) since the list is no longer a
      small fixed set. Implemented as a search/filter input (shown once the list exceeds 12
      categories) over the existing checkbox grid, now driven by `GET /teams/:id/categories`
      (already fetched in `Team.tsx`, previously only passed to `BrandVoiceSection`) instead of the
      hardcoded fixed-six `NEWS_CATEGORIES` constant. Broad-group-based visual grouping was not
      implemented (the categories endpoint returns flat names, no group info, and adding that would
      be a further backend response-shape change) — the search/filter approach was chosen as the
      lower-risk of the two options this task explicitly named as acceptable alternatives.
- [ ] 6.2 Manual check: subscribe to a broad group and to an individual discovered category; confirm
      the feed reflects both correctly. **Not done — no browser automation tool is available in this
      session** (confirmed via a tool search before reporting this as skipped, not assumed), and
      starting real dev servers here hits this environment's known friction (Redis needs a manual
      Docker start, Windows can't resolve `mongodb+srv://` SRV records without a DNS override) with
      no reliable way to drive a browser against them even once up. Covered instead by the
      automated integration tests in §5.3/§4.3, which exercise the identical backend logic.

## 7. Verification

- [x] 7.1 `cd backend && npm test && npm run build` — clean (556/556 tests passing, up from 533
      before this change's ~23 new tests across two implementation passes; build clean).
- [x] 7.2 `cd frontend && npm run build && npm run lint` — clean (same 4 pre-existing, unrelated
      lint errors as every prior session; no new ones).
- [ ] 7.3 Manual: run ingestion against real sources, confirm previously-dropped low-relevance items
      are now stored, and that at least one plausible new fine-grained category gets proposed and
      recorded in the taxonomy over a few runs. **Not done in this pass** — requires a running
      server with real external API access (adapters, LLM categorization) and, per this project's
      established convention, live runs against real infrastructure are not triggered automatically
      without the user's explicit go-ahead. Deterministic unit/integration coverage (§2.5, §3.4)
      exercises the identical code paths against mocked LLM responses instead.
