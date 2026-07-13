## Why

Every downstream AI flow in Growth Studio — semantic dedup in the filter pipeline (FR-02), Brand Voice RAG (FR-18), Ask Growth Studio chat (FR-22/23), and Robayat's opportunity scoring (FR-24) — runs `$vectorSearch` against MongoDB collections that don't exist yet. `backend-scaffold` (merged) only proved connectivity; it created no collections, no Mongoose schemas, and no Atlas Search indexes. `project-ida-requirments.md` §5.7 also still assumes 768-dim vectors from `nomic-ai/nomic-embed-text`, but `backend-scaffold`'s critical-fix #2 verification found that model isn't served on OpenRouter — the live, verified embedding provider is `openai/text-embedding-3-small` (1536-dim). Every collection and index defined here must use 1536, not the requirements doc's stale 768. This is Day-1 foundation work (`SPEC-DRIVEN-WORKFLOW.md` shared-foundation row #2) that blocks `news-ingestion-pipeline`, `filter-pipeline`, `brand-voice-rag`, `ask-growth-studio-chat`, and Robayat's `opportunity-scoring`.

## What Changes

- Add Mongoose schemas for the three vector-bearing collections: `news_items`, `brand_voice_examples`, `platform_posts` (per `project-ida-requirments.md` §5.8), each with a 1536-dim `embedding: number[]` field matching the verified `openai/text-embedding-3-small` output.
- **Correct the requirements doc's stale assumption**: all vector index definitions use `numDimensions: 1536`, `similarity: cosine`, not the 768-dim nomic spec written before the provider was verified.
- Create the 3 Atlas Vector Search indexes via an idempotent script (`createSearchIndex`, checked against `listSearchIndexes` first) rather than manual Atlas UI clicks, so any teammate can (re)create them against a fresh cluster:
  1. `news_items_vector_index` on `news_items.embedding` — semantic dedup (filter-pipeline) + Ask Growth Studio chat RAG
  2. `brand_voice_vector_index` on `brand_voice_examples.embedding` — Brand Voice RAG few-shot retrieval
  3. `platform_posts_vector_index` on `platform_posts.embedding` — opportunity scoring (Robayat)
- **Resolve a naming inconsistency in `project-ida-requirments.md`**: §5.7 calls the third index target `platform_analytics.posts`, but §5.8 defines it as a standalone `platform_posts` collection (separate from the aggregate `platform_analytics` collection). This change treats `platform_posts` as the standalone collection — it's what `SPEC-DRIVEN-WORKFLOW.md`'s `opportunity-scoring` row and the §5.8 data model both actually describe.
- Add a small verification script/step that runs a live `$vectorSearch` query against each of the 3 collections with a dummy embedded vector, confirming index build status is `READY` and query returns without an "index not found" error.
- Export shared Mongoose model modules (`backend/src/app/models/NewsItem.ts`, `BrandVoiceExample.ts`, `PlatformPost.ts`) other Samin changes will import directly — no other change should redefine these schemas.

## Capabilities

### New Capabilities
- `db-vector-indexes`: MongoDB collection schemas (`news_items`, `brand_voice_examples`, `platform_posts`) and their Atlas Vector Search indexes (1536-dim, cosine), created via an idempotent script and verified live against the Atlas M0 cluster.

### Modified Capabilities
_(none — `backend-scaffold` is the only existing spec and its requirements are unchanged; this change only adds new collections/indexes on top of it)_

## Impact

- **New**: `backend/src/app/models/NewsItem.ts`, `backend/src/app/models/BrandVoiceExample.ts`, `backend/src/app/models/PlatformPost.ts`, `backend/src/scripts/createVectorIndexes.ts` (idempotent index creation), `backend/src/scripts/verifyVectorIndexes.ts` (live query smoke test)
- **Modified**: `backend/package.json` (new `db:create-indexes` / `db:verify-indexes` scripts), possibly `backend/src/app/lib/verifyConnections.ts` if index-readiness is folded into startup checks
- **Downstream unblocked**: `news-ingestion-pipeline`, `filter-pipeline`, `brand-voice-rag`, `ask-growth-studio-chat` (Samin); `opportunity-scoring` (Robayat)
- **No breaking changes** — purely additive; no existing collections or code paths are touched
