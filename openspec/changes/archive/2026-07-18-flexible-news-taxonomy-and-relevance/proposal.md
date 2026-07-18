## Why

Two related, compounding problems, confirmed by reading the ingestion and feed-filtering code
directly:

1. **The ingestion pipeline discards items before they're ever stored.** `runIngestionPipeline`'s
   "Layer 3: Relevance & Trend Scoring" computes `relevance_score` for every item (max cosine
   similarity against the pooled embeddings of *every* team's `BrandVoiceExample`s — a global pool,
   not per-team), then hard-filters: `scored.filter(item => item.relevance_score >=
   NEWS_INGESTION_MIN_RELEVANCE)` whenever that pool is non-empty (i.e. as soon as *any* team
   anywhere has submitted brand-voice examples — which is true almost immediately given the demo
   team seeds two by default). Everything below the threshold is simply never written to `NewsItem`.
   Combined with team-level exact category filtering (`newsItem.service.ts`:
   `category: { $in: team.subscribed_categories }`), a story that's relevant to nobody's brand voice
   *yet* is gone forever, and a story that survives but doesn't exactly match a subscribed category
   string is invisible to every team regardless of how closely related it actually is.
2. **Categories are a fixed, hard-coded 6-value enum, both at ingestion and at subscription time.**
   `newsIngestion.categorize.ts`'s LLM prompt only offers `"AI"|"Web Dev"|"Career"|"Security"|
   "DevOps"|"Other"` and rejects anything else back to `"Other"`; `team.validation.ts`'s
   `subscribed_categories` field is `z.enum(NEWS_CATEGORIES)` — a team literally cannot subscribe to
   anything finer-grained than these 6 buckets. (Note: `NewsItem.category` itself is schema-unconstrained
   `{ type: String }` — the enum lock lives entirely in the categorization prompt/validator and the
   team-subscription validator, not the data model, which makes this tractable to loosen.)

Together, these mean: news gets thrown away before storage based on a pooled, cross-team
relevance signal nobody asked for at that stage; the categories items *can* get are coarse; and the
categories teams *can* subscribe to are exactly as coarse and must match exactly. The user-visible
result is a feed that stores and shows far less than what was actually fetched, with no room for
"nearly relevant."

## What Changes

- **Store everything fetched, always.** Remove the relevance-based storage gate from
  `runIngestionPipeline` — every deduped, freshness-passing item gets stored regardless of its
  `relevance_score`. `relevance_score`/`opportunity_score` continue to be computed and stored exactly
  as today (unchanged inputs to ranking/highlighting); they simply stop being a pass/fail gate on
  storage itself.
- **Introduce a global, growing category taxonomy** discovered during ingestion, available to every
  team (not per-team `custom_categories`, which stays as-is for the separate item-override feature).
  Seeded with the existing fixed 6; the categorization LLM call is shown the current known-category
  list each run and may reuse an existing one or propose a genuinely new, more specific one (e.g.
  "LLM Tooling" under the "AI" umbrella); new proposals are normalized and deduped (case/whitespace)
  before being added — "duplicate categories should be ignored" per the reported requirement. Every
  category (fixed or discovered) always maps to exactly one of the original 6 as its broad group.
- **Relax team subscription** from the fixed-6-only enum to any known taxonomy entry (fixed or
  discovered), and expose the full known set via the existing `GET /teams/:id/categories` endpoint
  (already used by the frontend) instead of a new one.
- **Flexible ("nearly relatable") feed matching**: a team subscribed to a broad group (e.g. "AI")
  sees every item under that group's fine-grained subcategories too, not only items with the exact
  literal string "AI"; additionally, a bounded semantic-similarity fallback surfaces items closely
  related to the team's subscribed categories/brand voice even when their assigned category doesn't
  match at all, using this codebase's already-provisioned (but currently unused by any query path)
  Atlas Vector Search index on `NewsItem.embedding`.

## Capabilities

### New Capabilities
- `global-category-taxonomy`: how categories are discovered, deduped, and made available to every
  team during ingestion, independent of any single team's configuration.
- `flexible-feed-relevance`: what gets stored during ingestion (everything, not a relevance-gated
  subset) and how a team's feed is matched to what it's subscribed to (broad-group fallback plus a
  bounded semantic-similarity "nearly relevant" inclusion), replacing today's storage-time relevance
  gate and exact-category-string feed filter.

### Modified Capabilities

_None — no main specs exist yet for this area. (This change does directly interact with
`team-readiness-gating`'s feed-gating logic — see design.md's Context section for how they compose.)_

## Impact

- **Backend:** `newsIngestion.service.ts` (remove the storage gate), `newsIngestion.categorize.ts`
  (taxonomy-aware prompt + normalization), a new small collection for the global taxonomy,
  `team.validation.ts` (relax `subscribed_categories`), `team.service.ts::getEffectiveCategories`
  (include the global taxonomy), `newsItem.service.ts` (broad-group + semantic-similarity feed
  matching), `newsItem.model.ts` (optional new `category_group` field).
- **Frontend:** `CategorySubscriptionsSection.tsx` (must handle a dynamic, potentially larger
  category list, not a fixed 6-checkbox layout).
- **Data:** existing stored `NewsItem` documents keep their current `category` values (all valid
  entries in the seeded fixed-6 taxonomy already) — no backfill required, though a one-time
  `category_group` backfill for pre-existing items is needed if that field is added (trivial: every
  existing category *is* already a broad group, so `category_group = category` for all of them).
- **Cost note:** storing every fetched item (not just relevance-passing ones) means content
  enrichment (Layer 3b) and categorization (Layer 4) now run over a larger set — see design.md's
  Risks section for the concrete mitigation.
