## Context

Confirmed by reading the pipeline and models directly:

- `runIngestionPipeline` (`newsIngestion.service.ts`) computes `relevance_score` via `scoreRelevance`
  (`newsIngestion.scoring.ts`) — max cosine similarity between an item's embedding and *every*
  `BrandVoiceExample` across *every* team (`fetchBrandVoicePool` has no team filter at all). It then
  hard-filters: `relevant = brandVoicePool.length === 0 ? scored : scored.filter(item =>
  relevance_score >= config.news_ingestion.min_relevance)`. Since the demo team already seeds two
  brand-voice examples on boot (`seedDemoAccounts.ts`), this pool is non-empty in almost any real
  deployment, so the gate is live almost immediately, not just in a true cold-start.
- `NEWS_INGESTION_MIN_RELEVANCE` defaults to `4.0` on a 0–10 scale.
- Categorization (`newsIngestion.categorize.ts`) hard-codes the 6-category enum directly in the LLM
  system prompt and rejects (falls back to `"Other"`) anything else via `isValidCategory`.
- `NewsItem.category` (`newsItem.model.ts`) is schema-unconstrained (`{ type: String }`) — the enum
  lock is entirely in application code (categorize.ts's validator, team.validation.ts's zod enum),
  not the data model. This is the main reason this change is tractable without a data migration of
  existing documents.
- `Team.subscribed_categories` PATCH validation (`team.validation.ts`) is
  `z.array(z.enum(NEWS_CATEGORIES))` — a hard rejection of anything outside the fixed six.
  `Team.custom_categories` (a *different*, already-free-form, per-team field, `addCategoryValidation`)
  is unrelated — it exists only for the item-level category-override feature
  (`NewsItemCategoryOverride`), not for feed subscription, and is untouched by this change.
- `newsItem.service.ts::getAllNewsItems` filters by `category: { $in: team.subscribed_categories }`
  — exact string match only, applied *after* `team-readiness-gating`'s not-ready short-circuit
  (that change ships independently; this one only changes what happens once a team *is* ready and
  its query actually runs — no ordering conflict, see that change's own design.md for the gate
  itself).
- An Atlas Vector Search index already exists on `news_items.embedding` (`createVectorIndexes.ts`,
  `news_items_vector_index`, cosine, 1536 dims) — provisioned but, per a direct search of every
  retrieval path in this codebase (chat, content-generation style retrieval, brand-voice scoring),
  **currently unused by any query** — every existing similarity computation is in-memory cosine over
  a fetched batch. This is the first proposal to actually use it via `$vectorSearch`.
- Content enrichment (Layer 3b, `newsIngestion.contentFetch.ts`) today only runs on `relevant`
  (post-relevance-filter) items — removing the storage gate means this now runs on a materially
  larger set unless a separate, narrower gate is introduced for it specifically (see Decisions).

## Goals / Non-Goals

**Goals:**
- Nothing fetched is thrown away before storage due to a pooled, cross-team relevance heuristic.
- Categories can grow to reflect what's actually being ingested, without a code deploy, while
  staying deduplicated and organized under the existing broad groups everything else (opportunity
  scoring, thumbnail-icon-by-category UI, dashboards) already depends on.
- A team's feed shows more of what's actually relevant to it, not less, without requiring the team
  to enumerate every fine-grained category by hand.

**Non-Goals:**
- No change to `content_hash`/dedup semantics, opportunity-score weighting formula, or trend
  scoring — this change is about *what gets stored* and *what a team sees*, not how already-computed
  scores are calculated.
- No removal of the fixed six categories or of `custom_categories`/`NewsItemCategoryOverride` — both
  stay exactly as they are; this change is additive to the taxonomy, not a replacement of it.
- No per-team relevance scoring at ingestion time (i.e. still one global brand-voice pool for
  `relevance_score`) — that's a separate, larger architectural question (would need per-team
  ingestion-time scoring against N teams' pools) explicitly out of scope here; storing everything
  makes the pooled score's imprecision much less consequential, since it's no longer a storage gate.
- No fully free-form, uncontrolled category sprawl — every category still funnels through
  normalization/dedup and a broad-group assignment; this is explicitly *not* "let the LLM invent
  anything, unchecked."

## Decisions

### 1. Remove the storage gate; keep computing `relevance_score`/`opportunity_score` unchanged

`relevant = scored` unconditionally (the `brandVoicePool.length === 0 ? scored : scored.filter(...)`
line is deleted, not just its threshold raised). Every deduped, fresh item is stored. Ranking
(`current_trend_score`, `opportunity_score`, the feed's default sort) is completely unaffected — it
already uses these scores as *ranking* signals, not filters, everywhere except this one gate.
Alternative considered: keep the gate but lower `NEWS_INGESTION_MIN_RELEVANCE` — rejected, since any
nonzero floor still throws away items pre-storage for the same reason the reported requirement
objects to (the pooled score is a proxy, not a ground truth, and pre-storage deletion is
irreversible without re-ingesting).

### 2. Content-enrichment cost is bounded by keeping *its own*, separate, much looser gate — not by re-introducing the storage gate

Layer 3b's content-fetch step currently runs on `relevant` (i.e., today, the same set that gets
stored). Once storage stops gating on relevance, naively enriching *everything* fetched would
multiply outbound HTTP calls (dev.to/GitHub API reads, generic article extraction) by however much
volume the old gate used to cut. Mitigation: give content enrichment its own opportunity-scoped
gate — e.g. skip enrichment only for items whose `opportunity_score` is in the bottom of the
distribution (a generous, separate threshold, tuned independently from storage) — so low-signal
items still get stored (with whatever snippet the adapter already provided) but don't all pay for a
full-content fetch. `NEWS_CONTENT_FETCH_CONCURRENCY` (already capped at 3) remains the hard
concurrency ceiling regardless. Alternative considered: enrich everything and rely on the existing
concurrency cap alone to bound load — rejected as a real, measurable cost/latency increase to every
ingestion run with no corresponding benefit (a low-opportunity item's full content is rarely worth
fetching before a team ever asks to see it).

### 3. Global taxonomy as its own small collection, seeded once with the fixed six

New collection (e.g. `news_categories`): `{ name: string (canonical display form), normalized_key:
string (lowercase+trimmed, unique index), broad_group: NewsCategory, source: 'seed' | 'ingestion',
created_at }`. Seeded idempotently with the fixed six (`broad_group` = itself for each). Chosen over
deriving the "known set" via `NewsItem.distinct('category')` on every read because: (a) it's a
stable place to store `broad_group` and the normalized dedup key without re-deriving them from
scratch on every categories-list request, and (b) it dedupe-checks a *proposed* new category before
any `NewsItem` referencing it is even written, which a distinct-scan on the items collection can't
do (there'd be nothing to distinct from yet, on the very first item proposing it).

### 4. Categorization prompt is taxonomy-grounded, not free-form

Each categorization batch's system prompt includes the current known-category list (name only, not
`broad_group` internals) and instructs the model to reuse an existing one whenever it reasonably
fits, and to propose a new, more specific one — *always alongside stating which of the six broad
groups it belongs under* — only when none of the existing ones do. This is the primary defense
against near-duplicate proliferation (e.g. the model choosing "AI" again instead of inventing
"Artificial Intelligence" because "AI" is right there in front of it); the taxonomy's
`normalized_key` uniqueness check is the secondary, exact-match-only safety net for
casing/whitespace variants specifically (design intentionally does not attempt fuzzy/semantic
category-name deduplication — see Open Questions).

### 5. Feed matching: exact match, broad-group fallback, and a bounded semantic "nearly relevant" tier

`newsItem.service.ts`'s query becomes, conceptually: `category IN subscribed_categories OR
category_group IN subscribed_categories` (the group fallback is free — same `$in`-style query, one
extra indexed field) **plus** a bounded semantic tier: items not caught by either match are
additionally checked via `$vectorSearch` against a representative vector for the team's subscription
(the team's pooled brand-voice-example embeddings, mirroring the existing pattern in
`fetchBrandVoicePool`/`scoreRelevance`, but per-team here rather than global — a natural, low-risk
per-team narrowing since this runs at *read* time against one team's own data, not at ingestion
time against everyone's). A configurable similarity floor (mirroring `NEWS_INGESTION_MIN_RELEVANCE`'s
existing pattern) bounds this tier. Using `$vectorSearch` (already provisioned, currently unused)
rather than in-memory cosine here specifically, because feed reads happen far more often and over a
much larger, continuously-growing corpus (every stored item, not a small per-request candidate
batch like chat's) than every other similarity computation in this codebase — the same in-memory
approach chat/content-generation use would not scale to "every feed request, every team."
Alternative considered: skip the semantic tier entirely and ship only the broad-group fallback —
simpler, zero new infra to wire up, and defensible as a first increment; flagged as a legitimate
staged-rollout option in Open Questions rather than decided away here.

### 6. `NewsItem.category_group` stored explicitly, not derived on read

Denormalized onto the document at write time (categorization already knows a discovered category's
group; a fixed-six category's group is itself) rather than joined against the taxonomy collection on
every feed read — cheaper, and matches this codebase's existing preference for storing derived
fields rather than joining (e.g. `current_trend_score` is precomputed, not derived per-request).

### 7. `subscribed_categories` validation relaxed to "any known taxonomy name," not fully free-form

`team.validation.ts` validates against the live taxonomy's known names (fixed + discovered) rather
than either the old fixed-six enum or an unchecked free string — a team still cannot subscribe to
gibberish that was never actually assigned to any item, preserving the existing "this field means
something real" property the old enum provided, just against a larger, living set.

## Risks / Trade-offs

- [Category-name drift over many ingestion runs/models despite prompt-grounding] → accepted, bounded
  by the exact-match dedup safety net (Decision 4); a bulk admin rename/merge tool (analogous to the
  existing per-item `NewsItemCategoryOverride`, but taxonomy-wide) is a reasonable follow-up if drift
  becomes a real, observed problem — not built preemptively here.
- [Storing everything increases `NewsItem` collection growth rate] → this codebase already has a
  retention/archival pipeline (`news-retention-lifecycle`, archived) that ages out old/low-trend
  items regardless of relevance — the existing lifecycle absorbs this, no new mechanism needed.
- [Content-enrichment cost, if Decision 2's separate gate is skipped or set too loose] → explicitly
  called out as its own decision with its own tunable floor, not silently inherited from the storage
  gate's removal.
- [`$vectorSearch` at feed-read time is genuinely new infrastructure usage for this codebase, with
  real latency-under-load characteristics not yet exercised anywhere] → mitigated by making the
  semantic tier an additive, bounded, separately-toggleable layer on top of the (simpler,
  zero-new-infra) exact+broad-group matching, which alone already materially improves recall; the
  semantic tier can ship as a fast-follow if the vector-search integration needs more validation time
  than the rest of this change.

## Migration Plan

1. Seed the global taxonomy collection with the fixed six (idempotent script, mirrors existing
   `seed:*` script conventions).
2. Backfill `category_group` on every existing `NewsItem`: trivial, since every currently-stored
   category *is* already one of the fixed six, so `category_group = category` for 100% of existing
   documents — a single `updateMany`-style script, no per-document computation needed.
3. Deploy the categorization/storage-gate/validation changes together (they're interdependent: an
   ungapped storage path feeding a taxonomy-unaware categorizer, or a relaxed subscription validator
   with no taxonomy to validate against, are each broken half-states).
4. Frontend `CategorySubscriptionsSection.tsx` update ships alongside, since a growing category list
   needs a different UI treatment than a fixed 6-checkbox grid (e.g. a searchable/grouped picker).

Rollback: revert the categorization/service changes; the taxonomy collection and `category_group`
field can be left in place inert (nothing reads them once the gating code is reverted) or dropped —
neither is destructive to `NewsItem`'s core fields.

## Open Questions

- Ship the semantic "nearly relevant" tier (Decision 5) in the same pass as the broad-group
  fallback, or stage it as a fast-follow once broad-group matching alone is validated in practice?
  Both are legitimate; this doc intentionally doesn't force a single-pass answer.
- Should the content-enrichment gate (Decision 2) reuse `NEWS_INGESTION_MIN_RELEVANCE`'s numeric
  scale directly (a second threshold on the same 0–10 axis) or be expressed against
  `opportunity_score` instead (which already blends relevance+trend+fit)? A tuning detail, not a
  design fork — pick based on which correlates better with "worth the fetch" once real post-storage
  data volume exists to look at.
- Is a bulk category-rename/merge admin tool needed at launch, or only if drift is actually observed
  in practice? Leaning toward the latter (don't build it preemptively).
