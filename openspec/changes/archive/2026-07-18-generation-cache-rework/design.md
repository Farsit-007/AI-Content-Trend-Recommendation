# Design — Generation Cache Rework

## Context

`generateContent` (`contentGeneration.service.ts`) currently: builds per-format Redis keys
(`content:{team}:{item|topicHash}:{language}:{pack}:{format}`), serves any hit unless
`regenerate: true`, and writes every fresh result back with `CONTENT_CACHE_TTL_SECONDS` (24h). The
consequence users see: the main Generate button returns byte-identical output for a full day. The
per-card Regenerate button already bypasses the cache, which makes the inconsistency more
confusing, not less. Intermediate work is cached separately today only for fact sheets
(`getOrExtractFactSheet`, 7-day TTL); the topic embedding and style retrieval are recomputed per
request but retrieval is in-process math over small pools (cheap) while the embedding is a network
call (worth caching).

The auto-generation job (`generatedContent.job.ts`) calls the same service daily; its dedupe is
"skip if a draft for this team+news-item already exists in Mongo" — it does not depend on the Redis
response cache for correctness, only (incidentally) for cost.

## Goals / Non-Goals

**Goals:**
- Every interactive Generate/Regenerate click yields a fresh draft.
- Keep total cost roughly flat by caching deterministic intermediates (fact sheet — already done;
  topic embedding — new).
- Auto-generation stays idempotent per team+item per day with an explicit test.

**Non-Goals:**
- No draft-history/versioning UI (previousText undo in the editor already covers the demo need).
- No caching of style retrieval or few-shot selection (in-process, no network cost).
- No change to the fact-sheet cache design.

## Decisions

1. **Delete the response cache entirely rather than shortening its TTL or keying it by a nonce.**
   A short TTL keeps the confusing "sometimes stale" behavior; a nonce key is a cache nobody ever
   reads. Removal is the honest design: creative output is not idempotent and should not pretend to
   be. Alternative considered: keep cache but make the Generate button send `regenerate: true` —
   rejected because it leaves dead code and a second (auto-gen) path that would then be the only
   cache consumer while not needing it for correctness.
2. **Keep accepting `regenerate` in the request schema (ignored) for one release** so an older
   frontend build doesn't get 400s from strict validation. Remove from the frontend now, from the
   backend schema later.
3. **Topic-embedding cache in Redis**: key `embed:topic:{sha256(topic)}:{modelId}`, 7-day TTL,
   value = JSON vector. Keyed by resolved embedding model id so a model change can't serve stale
   vectors. Only used when no `news_item_id` embedding is available (item embeddings are already
   stored on the item).
4. **Auto-gen cost guard stays where it is**: `AUTO_GENERATION_MAX_PER_RUN` plus the existing
   drafted-already Mongo check. Add a test that runs the job twice and asserts the second run
   creates zero new drafts and zero new LLM calls.

## Risks / Trade-offs

- [Cost increase for repeated generates] → intermediates cached; free-tier daily quota is the real
  ceiling and is being addressed separately via multi-key failover (see verified status report §4.5).
- [Old clients sending `regenerate`] → flag accepted-and-ignored during transition (Decision 2).
- [Tests coupled to caching behavior] → `contentGeneration.integration.test.ts` cache-hit tests are
  rewritten as fresh-generation tests in the same file; coverage of parse/prompt paths is unchanged.

## Migration Plan

Single deploy; no data migration. Existing `content:*` Redis keys simply expire within 24h (or
`redis-cli --scan --pattern 'content:*'` delete if desired). Rollback = revert commit.

## Open Questions

- Should the Generate page offer "N variations" per format (one call each) now that output is
  always fresh? Deferred — product call, not needed for the demo.
