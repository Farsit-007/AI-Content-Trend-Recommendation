## Why

Style-example retrieval (`rankStyleExamples`, `buildStyleContext`) ranks a pack's examples by cosine
similarity between `openai/text-embedding-3-small` embeddings of the raw Bangla post text and the
topic being generated for. Nobody has ever verified this ranks sensibly for Bangla content — the
tooling to check it exists (`npm run verify:style-pack-retrieval`) but has never been run against a
real corpus and had its outcome recorded (Gate G1 in the parent plan is, like Gate G3, still
unresolved). This change is being proposed ahead of that verdict, at explicit user request, as a
**ready-but-inactive fallback**: if G1 is eventually run and shows poor Bangla retrieval quality
(the failure mode this exists for), the fix is already built and can be flipped on immediately
instead of designed from scratch under time pressure. It ships off by default and changes nothing
about current retrieval behavior until someone deliberately turns it on with evidence in hand.

The specific failure mode this guards against: topic queries fed into retrieval are frequently
English-leaning news titles (`payload.topic`, often an ingested article headline), while style
examples are Bangla-script posts. Embedding both in their native form and comparing may rank poorly
if the embedding model's cross-lingual alignment for Bangla is weaker than same-language comparison
— summarizing each example's topic into English before embedding removes that asymmetry.

## What Changes

- Add an opt-in embedding strategy for style examples: at creation time (single add, bulk import,
  and the CLI seed script), when `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY=true`, an LLM extracts a 1-2
  sentence **English** topic summary of the post (e.g. "A motivational post encouraging beginners to
  start coding today, emphasizing that starting is the hardest part.") and the stored embedding is
  computed from that summary instead of the raw Bangla content. The summary itself is persisted
  (`topic_summary`) for auditability — so a reviewer can see exactly what got embedded and why an
  example ranked where it did.
- Off by default (`false`) — zero change to current retrieval for any deployment that doesn't set
  this. When off, every code path is byte-identical to today.
- Every `StyleExample` gains `embedding_source: 'content' | 'topic_summary'`, recording which
  strategy produced its stored embedding. Retrieval itself (`rankStyleExamples`) is unchanged —
  cosine similarity works identically regardless of what the embedding was derived from; only what
  gets embedded at write time changes.
- Summary extraction soft-fails to today's behavior (embed the raw content, `embedding_source: 'content'`)
  on any LLM error or malformed response — enabling the flag can never make example creation less
  reliable than it is today, only change what gets embedded on the happy path.
- Add a one-off migration script (`npm run migrate:style-example-embeddings`) that re-embeds
  existing examples via the topic-summary strategy, processing one pack at a time, idempotent by
  skipping rows already marked `embedding_source: 'topic_summary'`.
- Extend `verify:style-pack-retrieval` to print each result's `embedding_source`, so the same script
  used to establish Gate G1's original verdict is also how a second verdict (after migrating a pack)
  gets checked — re-running G1's check is this change's own acceptance test, not a new tool.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `style-packs`: extends `StyleExample` creation (single add, bulk import) with an optional
  embedding-strategy switch; no change to the request/response shapes of existing endpoints.

## Impact

- **Backend:** `backend/src/app/modules/StylePack/stylePack.interface.ts` +
  `stylePack.model.ts` (new fields), `stylePack.service.ts` (`addExample`/`addExamplesBulk` gain the
  summary-extraction step behind the flag), `backend/src/scripts/seedStylePack.ts` (same),
  `backend/src/scripts/verifyStylePackRetrieval.ts` (print the marker), new
  `backend/src/scripts/migrateStyleExampleEmbeddings.ts`, `config/index.ts` + `.env.example` (one
  new flag).
- **Tests:** unit tests for the soft-fail extraction wrapper; integration tests confirming the flag
  off produces byte-identical `addExample`/`addExamplesBulk` behavior to today, and flag on stores
  `topic_summary`-derived embeddings with the correct marker.
- **No breaking changes.** Additive fields only (`embedding_source` defaults to `'content'` for
  every pre-existing document via a lean backfill query, matching this codebase's established
  pattern for schema additions — see `newsRetention.service.ts`'s `lifecycle` backfill for
  precedent); retrieval ranking logic itself is untouched.
