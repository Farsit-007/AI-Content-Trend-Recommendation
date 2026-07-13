## 1. Mongoose schemas

- [x] 1.1 Create `backend/src/app/models/NewsItem.ts` — fields per design Decision #5: `source`, `source_id`, `content_hash` (unique index), `title`, `url`, `snippet`, `published_at`, `engagement: { points, comments, stars_delta }`, `trend_score`, `category`, `relevance_score`, `impact_note` (all three optional — populated later by `ai-categorization-scoring`), `embedding: number[]` (1536-length), `opportunity_score`, `processed`, `created_at`
- [x] 1.2 Create `backend/src/app/models/BrandVoiceExample.ts` — `platform`, `category`, `content`, `embedding: number[]` (1536-length), `engagement_hint`, `added_by`, `created_at`
- [x] 1.3 Create `backend/src/app/models/PlatformPost.ts` — targets the standalone `platform_posts` collection (not `platform_analytics`); `platform`, `post_id`, `content_snippet`, `embedding: number[]` (1536-length), `metrics: { reach, likes, comments, shares, views }`, `published_at`, `fetched_at`; compound unique index on `{ platform, post_id }`
- [x] 1.4 `cd backend && npm run typecheck` passes with the 3 new model files

## 2. Vector index creation script

- [x] 2.1 Create `backend/src/scripts/createVectorIndexes.ts`: connects via `mongoose.connect(config.database_url)`, defines the 3 index specs (`news_items_vector_index` on `news_items.embedding`, `brand_voice_vector_index` on `brand_voice_examples.embedding`, `platform_posts_vector_index` on `platform_posts.embedding`), each `numDimensions: 1536`, `similarity: cosine`
- [x] 2.2 For each collection: call `listSearchIndexes` first, skip creation if an index with the target name already exists, otherwise call `createSearchIndex()` and log the result — also had to add an explicit `db.createCollection()` step first (Atlas's `createSearchIndex`/`listSearchIndexes` require the namespace to already exist; it isn't lazily created the way normal writes are)
- [x] 2.3 Add `db:create-indexes` script to `backend/package.json` running this file (e.g. via `ts-node`)
- [x] 2.4 Run `npm run db:create-indexes` live against the shared Atlas M0 cluster and record the output in this file's notes — **verified live**: first run created all 3 indexes (`news_items.news_items_vector_index`, `brand_voice_examples.brand_voice_vector_index`, `platform_posts.platform_posts_vector_index`); re-run confirmed idempotency (`already exists, skipping` for all 3). Also hit and fixed the known local-DNS SRV-lookup quirk from `backend-scaffold` notes (resolver pinned to `127.0.0.1`) by setting `dns.setServers(['8.8.8.8', '1.1.1.1'])` inside this script only — scoped fix, doesn't touch already-merged scaffold code.

## 3. Live verification

- [x] 3.1 Create `backend/src/scripts/verifyVectorIndexes.ts`: for each of the 3 collections, use the existing `embed()` client (`backend/src/app/lib/embeddings.ts`) to embed a short dummy string, run `$vectorSearch` against that collection with the resulting vector, and assert the query returns without an "index not found" error
- [x] 3.2 Poll/retry (short timeout) if an index reports a non-`READY`/non-queryable build status immediately after creation, per design's async-index-build risk — also had to add a **second** retry loop around the `$vectorSearch` query itself: Atlas Search indexes are near-real-time, not synchronous, so a freshly-seeded document can take a few seconds to become searchable even after the index itself reports `queryable: true`. First run without this returned zero results for all 3 collections; adding query-level retry fixed it.
- [x] 3.3 Seed one throwaway document per collection (with a real embedding) so the verification query has something to potentially match, then clean it up after verification — confirmed live: all 3 collections had 0 leftover `__verify__`-tagged documents after the script ran
- [x] 3.4 Add `db:verify-indexes` script to `backend/package.json`
- [x] 3.5 Run `npm run db:verify-indexes` live and record pass/fail per collection in this file's notes — **verified live**: `news_items: PASS — 1 result(s) returned`, `brand_voice_examples: PASS — 1 result(s) returned`, `platform_posts: PASS — 1 result(s) returned`

## 4. Final checks

- [x] 4.1 `cd backend && npm run typecheck` passes
- [x] 4.2 Confirm no existing collections, routes, or `backend-scaffold` behavior were modified — this change is additive only — confirmed via `git status`: only `backend/package.json` modified (2 new npm scripts added), everything else is new/untracked files (`backend/src/app/models/`, `backend/src/scripts/`, `openspec/changes/db-vector-indexes/`)
- [x] 4.3 Note in the PR description that `platform_posts` (not `platform_analytics.posts`) is the resolved collection name, so Robayat sees it before building `opportunity-scoring` against it — done in PR #10: https://github.com/mehedi-imun/AI-Content-Trend-Recommendation/pull/10
