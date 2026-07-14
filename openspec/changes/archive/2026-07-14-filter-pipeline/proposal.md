## Why

The news ingestion pipeline (`backend/src/app/modules/NewsIngestion/`) only dedupes on exact `content_hash` (source + URL). The same story routinely appears on multiple sources with different URLs (e.g. an HN submission and a Dev.to cross-post of the same article, or a GitHub repo trending alongside a Reddit thread about it) and is currently stored once per source, inflating the feed with near-duplicate items and burning relevance/trend/LLM categorization work on content that's already represented.

## What Changes

- Add a **cross-source semantic dedup layer** using the item embeddings the pipeline already computes for relevance scoring — no new embedding calls.
- Compare each candidate item's embedding against (a) other candidates surviving hash-dedup in the same run, and (b) recently-stored `NewsItem` embeddings (same freshness window as `NEWS_INGESTION_MAX_AGE_HOURS`), using max cosine similarity — mirroring the existing pooled brand-voice pattern in `newsIngestion.scoring.ts`.
- Items whose max similarity meets/exceeds a new configurable threshold (`NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD`) are discarded as duplicates before relevance/trend scoring and LLM categorization. When an in-run near-duplicate pair is found, keep the one with the higher raw engagement (points + comments + stars_delta) and discard the other.
- Reorder the pipeline slightly so item embeddings are generated once, immediately after hash-dedup/freshness filtering, and reused for both semantic dedup and relevance scoring (currently embeddings are only generated for the relevance-scoring step).
- Extend the per-source `IngestionSummary` counts so semantically-deduped items are reflected in the existing `discarded` count (no new summary field needed).

## Capabilities

### Modified Capabilities
- `news-ingestion`: the Deduplication requirement expands from exact `content_hash` matching to also include cross-source semantic similarity dedup, using item embeddings.

## Impact

- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts` — reorder to compute embeddings right after hash-dedup/freshness, add the semantic dedup step before relevance/trend scoring.
- `backend/src/app/modules/NewsIngestion/newsIngestion.utils.ts` (or a new `newsIngestion.dedup.ts`) — semantic dedup logic; reuses `cosineSimilarity` currently private to `newsIngestion.scoring.ts` (will need to be exported/shared).
- `backend/src/app/modules/NewsIngestion/newsIngestion.service.ts` — one additional query to fetch recently-stored `NewsItem` embeddings within the freshness window (same pattern as `fetchBrandVoicePool`).
- `backend/src/config/index.ts` — new env var `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` (safe default, e.g. `0.93`), following the existing zod schema convention.
- No schema changes to `NewsItem` — semantic dedup only reads its existing `embedding` field.
