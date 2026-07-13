## Context

`backend-scaffold` (merged, `main`) verified Atlas connectivity, `$vectorSearch` stage acceptance, and the embedding provider (`openai/text-embedding-3-small` via OpenRouter, 1536-dim, cosine-ready) — but created zero collections, zero Mongoose schemas, and zero Atlas Search indexes. Nothing in `backend/src` currently reads or writes `news_items`, `brand_voice_examples`, or `platform_posts`.

`project-ida-requirments.md` §5.7–5.8 documents 3 vector indexes and their data models, but it was written before critical-fix #2 verification and still says `768-dim` / `nomic-ai/nomic-embed-text` — both wrong. It also names the third index target inconsistently: §5.7 says `platform_analytics.posts.embedding`, §5.8 defines a standalone `platform_posts` collection. `SPEC-DRIVEN-WORKFLOW.md`'s `opportunity-scoring` row (Robayat, depends on this change) says "`$vectorSearch platform_posts`" — confirming `platform_posts` as the real, standalone collection name to build against.

This is Day-1 shared foundation (`SPEC-DRIVEN-WORKFLOW.md` row #2, depends only on `backend-scaffold`). It directly unblocks 4 of Samin's 6 remaining changes and 1 of Robayat's 5. Constraint: still $0 budget, Atlas M0 free tier, same cluster `backend-scaffold` already created.

## Goals / Non-Goals

**Goals:**
- Ship Mongoose schemas for the 3 vector-bearing collections (`news_items`, `brand_voice_examples`, `platform_posts`), correcting the requirements doc's dimension and naming mistakes
- Create the 3 Atlas Vector Search indexes reproducibly via script (not manual Atlas UI clicks) so the setup survives a cluster reset or a new teammate's environment
- Verify each index is queryable with a live `$vectorSearch` call before declaring this change done — matching the "verify, don't assume" discipline `backend-scaffold` established for the embedding provider
- Keep the schemas minimal — only fields needed by the indexes and by the FRs that already exist (§5.8); no speculative fields for features not yet scoped

**Non-Goals:**
- `platform_analytics` (aggregate) and `generated_content` / `reports` collections — those belong to Robayat's analytics changes and Samin's `content-generator`/report work respectively, not this change
- Any ingestion, embedding-generation, or dedup logic that *writes* to these collections — that's `news-ingestion-pipeline` and `filter-pipeline`
- Populating `brand_voice_examples` with real seed data — that's `brand-voice-rag`, which depends on Mehedi's seed-post collection (per `SAMIN.md`)
- Index tuning (e.g., `numCandidates` sizing, pre-filtering) beyond a sane documented default — later changes that actually run queries can tune based on real latency

## Decisions

### 1. Vector dimension: 1536, not 768 — correcting the requirements doc
`openai/text-embedding-3-small` (the provider `backend-scaffold` verified live) returns 1536-dim vectors. `project-ida-requirments.md` §5.7/5.8 says `768-dim` because it was written for `nomic-ai/nomic-embed-text`, which critical-fix #2 found unavailable on OpenRouter. All 3 index definitions and all 3 Mongoose schema `embedding` fields use `numDimensions: 1536`. This is the single most important correction this change makes — every downstream RAG flow depends on getting this number right on the first try, since a dimension mismatch fails silently at query time (Atlas returns zero results, not an error) rather than at index-creation time.

### 2. `platform_posts` as the standalone collection name (not `platform_analytics.posts`)
§5.7 and §5.8 of the requirements doc disagree with each other. Resolved in favor of §5.8's explicit standalone collection definition and `SPEC-DRIVEN-WORKFLOW.md`'s `opportunity-scoring` row, both of which say `platform_posts`. `platform_analytics` (owned by Robayat's `facebook-analytics`/`youtube-analytics`/`linkedin-analytics` changes) stores aggregated 30-day metrics with no per-post embeddings — it's not the same shape as a collection you'd run `$vectorSearch` against per-post. Flagging this explicitly in the proposal so Robayat can object in PR review before `opportunity-scoring` is built against the wrong name.

### 3. Index creation via idempotent script, not manual Atlas UI
Atlas Search/Vector indexes can be created through the Atlas UI, Atlas CLI, or the MongoDB driver's `createSearchIndex()` (wraps the `createSearchIndexes` server command, supported on M0). Script chosen over UI clicks because: (a) it's the only option that's reproducible if the cluster is ever recreated, (b) it's diffable/reviewable in a PR the way UI clicks aren't, (c) it can check `listSearchIndexes` first and skip creation if the index already exists, making it safe to re-run. The script uses the native driver's `db.collection(name).createSearchIndex({ name, type: 'vectorSearch', definition })` form (Atlas Search index management API), called once per collection, driven off `mongoose.connection` after `mongoose.connect()`.

### 4. Vector index definition shape
Each of the 3 indexes uses the same `fields` shape:
```json
{
  "type": "vectorSearch",
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" }
  ]
}
```
`cosine` chosen (not `euclidean`/`dotProduct`) because `text-embedding-3-small` vectors are not pre-normalized to unit length by OpenAI, and cosine similarity is what §5.7's dedup threshold (`> 0.9`) and all 4 RAG flow descriptions assume throughout the requirements doc.

### 5. Schema scope: 3 new Mongoose model files, minimal fields
One file per collection under `backend/src/app/models/` (`NewsItem.ts`, `BrandVoiceExample.ts`, `PlatformPost.ts`), each exporting a typed Mongoose model. Fields taken directly from §5.8's data models, trimmed to what's needed now:
- `NewsItem`: `source`, `source_id`, `content_hash`, `title`, `url`, `snippet`, `published_at`, `engagement` (points/comments/stars_delta), `trend_score`, `category`, `relevance_score`, `impact_note`, `embedding`, `opportunity_score`, `processed`, `created_at` — categorization/scoring fields are optional/nullable since `ai-categorization-scoring` populates them later, not this change
- `BrandVoiceExample`: `platform`, `category`, `content`, `embedding`, `engagement_hint`, `added_by`, `created_at`
- `PlatformPost`: `platform`, `post_id`, `content_snippet`, `embedding`, `metrics` (reach/likes/comments/shares/views), `published_at`, `fetched_at`

No indexes beyond the vector index and a couple of obvious lookup indexes (`content_hash` unique on `news_items` for dedup-by-hash, `post_id` + `platform` compound on `platform_posts`) — anything more is premature for a hackathon.

## Risks / Trade-offs

- **[Risk]** M0 free-tier clusters have historically had limited/slower Search index support compared to paid tiers → **Mitigation**: `backend-scaffold` already confirmed `$vectorSearch` works live on this exact M0 cluster; this change's verification script (live query per index) catches any tier-specific limitation immediately rather than assuming it works.
- **[Risk]** Index builds are asynchronous — a `createSearchIndex()` call returns before the index is queryable → **Mitigation**: verification script polls `listSearchIndexes` (or retries the `$vectorSearch` query) until status is `READY` or a short timeout elapses, rather than assuming immediate availability.
- **[Risk]** Dimension mismatch (1536 vs the doc's stale 768) silently returns empty results instead of erroring → **Mitigation**: this is exactly why decision #1 exists; verification script asserts a non-empty result set against a real 1536-dim dummy vector, not just "index exists."
- **[Risk]** `platform_posts` naming decision (#2) could be wrong if Robayat had a different assumption in flight → **Mitigation**: called out explicitly in the proposal's "What Changes" and here, so it surfaces in PR review before `opportunity-scoring` is built.

## Migration Plan

1. Add `backend/src/app/models/NewsItem.ts`, `BrandVoiceExample.ts`, `PlatformPost.ts` with schemas per Decision #5
2. Add `backend/src/scripts/createVectorIndexes.ts` — connects via `mongoose.connect(config.database_url)`, for each of the 3 collections checks `listSearchIndexes` and creates the index (Decision #3/#4) only if missing, logs result per collection
3. Add `backend/src/scripts/verifyVectorIndexes.ts` — for each collection, embeds a short dummy string via the existing `embed()` client, runs `$vectorSearch` with that vector, asserts the index is `READY` and the query doesn't error
4. Add `db:create-indexes` and `db:verify-indexes` scripts to `backend/package.json`
5. Run both scripts live against the shared Atlas M0 cluster; record verification output in this change's tasks.md as evidence (matching `backend-scaffold`'s "verify, don't assume" pattern)
6. `cd backend && npm run typecheck`

No rollback complexity — additive only, no existing collections or running code touched. If an index needs to be recreated, `createVectorIndexes.ts` is safely re-runnable.

## Open Questions

- None blocking — the one ambiguity in the source docs (`platform_analytics.posts` vs `platform_posts`) is resolved by Decision #2 and flagged for Robayat's review.
