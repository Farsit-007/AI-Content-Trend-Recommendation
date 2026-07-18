## Context

`StylePack`/`StyleExample` (`backend/src/app/modules/StylePack/`) is the global, super-admin-curated writer-
style RAG behind Bangla content generation. Today it supports only:
- `POST /style-packs/:id/examples` — one example per call, embeds via `embed()` (one HTTP round-trip each).
- `scripts/seedStylePack.ts` — CLI bulk loader, but still one `embed()` call per new example (serial), and
  its only de-dup check is exact-string match against existing content.
- `scripts/generateStyleCard.ts` — CLI-only style-card generator; the card and its freshness are invisible
  to the super-admin curation UI (`frontend/src/pages/dashboard/admin/StylePacks.tsx`), which has no way to
  show a card at all today, let alone whether it's stale relative to the pack's current examples.

Building a real corpus (the product goal — 30-100 real posts per pack, per
`9-VISION-V7-V9-WRITER-STYLE-QUALITY-OPENSPEC-PLAN.md` Track 0) with only single-example add and a
developer-only CLI is impractical for a non-technical curator and slow even for a developer (N embedding
HTTP calls for N examples). This change adds a bulk path and closes the card-freshness visibility gap,
without changing anything about how packs are *used* during generation (that's `contentGeneration.retrieval.ts`,
untouched here).

## Goals / Non-Goals

**Goals:**
- Let a super_admin import up to 100 examples in one action (API + UI), with one embeddings HTTP call
  regardless of batch size.
- Prevent accidental duplicate examples (same post pasted twice with different whitespace) without
  rejecting legitimately similar-but-different posts.
- Make style-card freshness inspectable and let a super_admin regenerate a card without shell access.
- Keep the CLI seed script and the new API in lockstep by sharing one service implementation for both
  card generation and (where applicable) the de-dup/embedding strategy.
- Fix the auto-generation job's stale `lifecycle` filter while working in this immediate neighborhood
  (small, unrelated-capability, but cheap to bundle and otherwise easy to forget).

**Non-Goals:**
- Changing retrieval behavior, prompt structure, or how packs are selected during generation — all
  untouched (`style-packs-generation` already shipped that).
- Semantic (embedding-based) near-duplicate detection for style examples — deliberately out; see Decision 2.
- Any change to brand-voice examples, news-item embeddings, or the 0.88 news semantic-dedup threshold.
- Automated scraping or collection of writer content — corpus collection stays human/manual (Track 0 in the
  parent plan); this change only makes *loading* already-collected content faster.
- Background/async job infrastructure for card generation — the call stays synchronous, matching the
  latency class of other on-demand LLM endpoints in this codebase (e.g. `/content/refine`).

## Decisions

### 1. Bulk endpoint mirrors the seed-file contract exactly

`POST /style-packs/:id/examples/bulk` accepts the identical JSON shape used by
`seedStylePack.ts`/`style-pack.example.json`: `[{ content, platform?, source_ref?, engagement_hint? }]`,
capped at 100 items. A curator can hand the same file to either the CLI or the new UI/API path with zero
translation. Alternative considered: a CSV upload — rejected because posts often contain commas, newlines,
and quotes (native to social content), making JSON the lower-friction format for a curator who's likely
copy-pasting from a spreadsheet or export anyway; a future CSV importer, if wanted, can convert to this same
JSON shape client-side without touching the API.

### 2. De-duplication is whitespace-normalization, not semantic similarity

Duplicate check: `content.trim().replace(/\s+/g, ' ')` equality, checked against (a) the pack's existing
examples and (b) earlier items in the same batch. This catches the real failure mode — the same post
copy-pasted twice with different line breaks/trailing spaces. Cosine-similarity near-dup detection (the
pattern used for news semantic dedup at threshold 0.88) is deliberately **not** reused here: two genuinely
different posts about the same campaign or topic are exactly the corpus diversity a style pack needs, and
the 0.88 threshold has no calibration meaning for short social posts vs. the news-article domain it was
tuned for. Introducing it here risks silently dropping legitimate, distinct examples with no way for the
curator to know why the count came back low.

### 3. Card generation logic is extracted to the service, not duplicated

`sampleWithinBudget`, the fixed 7-aspect `ANALYSIS_INSTRUCTION`, and the `chatCompletion` call move from
`scripts/generateStyleCard.ts` into `StylePack` service as `generateCardForPack(packId): Promise<string>`
(throws `NOT_FOUND` for a missing pack, a client error for zero examples). The script becomes a thin
wrapper: connect → call the service function → print. This guarantees the CLI and the new
`POST /:id/generate-card` endpoint can never drift in behavior — a common failure mode when the same LLM
logic exists in two places. Card metadata (`style_card_generated_at`, `style_card_example_count`) is
persisted by the same service call, so both entry points get metadata for free.

### 4. Staleness is derived, not stored as a flag

No `is_stale` boolean is persisted. A pack is stale when `example_count !== style_card_example_count`, or
when `style_card` is absent — computed by the reader (API response includes both counts; the frontend does
the comparison). Rationale: a stored flag would need to be kept in sync on every example add/delete/bulk-
import, multiplying write paths that must remember to touch it. Deriving it at read time from two numbers
that are already being persisted/returned is strictly simpler and cannot drift out of sync.

### 5. Bulk endpoint and single-example endpoint stay separate

Not folding the existing `POST /:id/examples` into a `{ items: [...] }`-always shape — the single-add
endpoint already has UI callers (the existing paste-one-textarea flow) and existing tests; changing its
request shape is an unnecessary breaking change for zero benefit. The two endpoints share the same
underlying `embedBatch`-vs-`embed` choice only where it matters (bulk uses `embedBatch`; single-add keeps
`embed()`, since one item needs no batching).

### 6. Fold-in fix scope

`generatedContent.job.ts`'s `NewsItem.find(...)` gains `lifecycle: 'active'` in its filter, replacing the
stale `// lifecycle: 'active' — seam for the retention plan to add once lifecycle exists on NewsItem`
comment (the field has existed on `NewsItem` since the retention change shipped; the seam was never closed).
This is unrelated to style packs but is a one-line, low-risk correctness fix living in a file this change's
author will already have open contextually adjacent work in; bundling avoids a separate near-zero-effort
change purely for process overhead. It does not appear in this change's spec delta (it's not a `style-packs`
requirement) — it's tracked as an implementation task only.

## Risks / Trade-offs

- **[Risk] A 100-item batch with many long posts could approach embeddings-API payload limits.** →
  Mitigation: `embedBatch` already caps each item at 6000 chars (`lib/embeddings.ts`); 100 items × 6000
  chars is well within OpenRouter's per-request limits for `text-embedding-3-small`, and per-example content
  is already capped at 8000 chars by existing validation before it reaches embedding.
- **[Risk] Card regeneration is a synchronous LLM call from an admin UI button — a slow/failed OpenRouter
  response blocks the request.** → Mitigation: same latency class already accepted for `/content/generate`
  and `/content/refine`; existing `chatCompletion` failover (to `LLM_MODELS.fallback`) applies unchanged.
  No new timeout handling needed beyond what Express/the HTTP client already does.
- **[Risk] Whitespace-only de-dup could still let near-identical-but-not-identical duplicates through** (e.g.
  a post re-shared with one word changed) → Mitigation: accepted by design (Decision 2) — the corpus-quality
  cost of occasional near-dupes is lower than the cost of a similarity threshold silently rejecting
  legitimately distinct posts; curators can manually delete an obvious near-dupe via the existing per-
  example delete control.
- **[Trade-off] Extracting card-generation logic into the service is a small refactor of already-shipped,
  tested code (`generateStyleCard.ts`)** → Accepted: the alternative (duplicating the prompt/sampling logic
  in a new service method) creates exactly the drift risk this change exists partly to avoid; the script's
  existing behavior is preserved via a thin wrapper, so no functional regression.

## Migration Plan

No data migration — `style_card_generated_at` and `style_card_example_count` are new optional fields;
existing packs simply read as "card never generated via this metadata-tracked path" until the first
regenerate (even if they already have a hand-written or previously-CLI-generated `style_card` from before
this change — that text is preserved, only the new metadata starts as absent, which correctly renders as
"stale/unknown freshness" until the next regenerate). No rollback complexity: the change is purely additive
(new endpoints, new optional fields, refactored-but-behavior-preserved script); reverting the code change
requires no data cleanup.

## Open Questions

- None blocking implementation. The only external dependency (Track 0 producing a real corpus to bulk-import)
  is tracked outside this change per the parent plan and is not required for this change's own verification
  (verification here uses scratch/test data).
