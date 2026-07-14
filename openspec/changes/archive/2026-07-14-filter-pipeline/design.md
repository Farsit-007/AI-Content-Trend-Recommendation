## Context

`runIngestionPipeline()` (`backend/src/app/modules/NewsIngestion/newsIngestion.service.ts`) currently runs four layers: fetch/normalize → dedupe (exact `content_hash`) + freshness → relevance/trend scoring → categorize/opportunity scoring. Item embeddings are generated inside layer 3, one `embed()` call per item, used only for `scoreRelevance` against a pooled `BrandVoiceExample` set.

Exact-hash dedup only catches the same URL appearing twice. It does not catch the same story appearing under different URLs across sources (HN link post + Dev.to cross-post + a Reddit thread linking to the same article) — these are common in a 5-source aggregator and currently all get stored, embedded, and LLM-categorized as if they were distinct.

Constraints from the existing codebase:
- `cosineSimilarity` already exists in `newsIngestion.scoring.ts` but is private to that module.
- `NewsItem.embedding` already has an Atlas vector search index (`createVectorIndexes.ts`), but for a single run, in-memory pooling (as already done for `BrandVoiceExample`) is simpler than per-item vector search round-trips.
- Embeddings are the expensive-ish step (one `embed()` call per surviving item); the fix must not add a second embedding pass.
- Config follows the strict zod schema in `config/index.ts` — new env vars must be added there.

## Goals / Non-Goals

**Goals:**
- Catch cross-source duplicates (same story, different URL) using the embeddings already computed for relevance scoring — zero additional `embed()` calls.
- Also catch duplicates against items stored in previous runs within the freshness window, not just duplicates within the same run.
- Keep the higher-engagement item when two in-run candidates are near-duplicates of each other.
- Preserve the "one source failing doesn't kill the run" and "graceful degradation" properties of the existing pipeline.

**Non-Goals:**
- Replacing or removing exact `content_hash` dedup — semantic dedup is additive, exact-hash dedup still runs first (cheaper, catches the common case).
- A configurable per-team or per-category dedup threshold — one global threshold for now.
- Deduplicating against the full `news_items` history — only against items within the same freshness window already used for staleness filtering (`NEWS_INGESTION_MAX_AGE_HOURS`), consistent with the assumption that older stored items aren't meaningfully "the same current story" anymore.
- Persisting *why* an item was dropped (which item it duplicated) — the summary's existing `discarded` count absorbs semantic-dedup drops same as freshness/relevance drops.

## Decisions

**Move embedding generation earlier, keep it a single pass.** Today: `unique` (post hash-dedup, post-freshness) items are embedded inside the `Promise.all` that also computes `relevance_score`/`trend_score`. New flow: embed `unique` items first (unchanged cost — same items, same one call each), then run semantic dedup using those embeddings, then run relevance/trend scoring only on the survivors. This means `scoreRelevance`/`scoreTrend` now operate on a smaller, deduped set — strictly cheaper than today, not more expensive.

**Two comparison pools, both in-memory, both fetched once per run** (mirrors the existing `fetchBrandVoicePool` pattern):
1. **In-run pool**: the `unique` items' own embeddings, compared pairwise.
2. **Recently-stored pool**: `NewsItem.find({ published_at: { $gte: cutoff } }, { embedding: 1 })` using the same `cutoff` as `filterFresh`'s freshness window — one query per run, not one per item.

**Dedup algorithm**: process `unique` items in the order they arrive. For each item, compute max cosine similarity against (a) the recently-stored pool and (b) previously-accepted items from this same run (not the full in-run set — avoids O(n²) blowup and avoids comparing an item against a duplicate that's already been dropped). If max similarity ≥ `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD`, the item is a duplicate:
- If the match came from the recently-stored pool: discard the new item outright (something equivalent is already live).
- If the match came from an already-accepted in-run item: keep whichever of the two has higher raw engagement (`raw_points + raw_comments * 2 + raw_stars_delta * 3`, the same weighting `scoreTrend` already uses) — discard the loser. If the loser was already accepted, remove it from the accepted set.
Otherwise, add the item to the accepted set and continue.

This single-pass, greedy approach is O(n·m) where n = in-run candidates and m = accepted-so-far + recently-stored pool size — acceptable at the pipeline's existing scale (≤~50 items/run, recently-stored pool bounded by the same freshness window as everything else, typically a few hundred items at most).

**Threshold: `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD`, default `0.88`.** Higher than the relevance threshold (`0.4` on the 0–10 scale, i.e. cosine 0.04) by design — relevance asks "is this roughly on-topic for our brand voice," dedup asks "is this the same story," which needs a much tighter match. Originally set to `0.93` as a conservative starting guess, then recalibrated to `0.88` after live verification against the real embedding model: two independently-worded descriptions of the same story (same event, different sources) scored `0.8987` cosine similarity — below `0.93`, so they weren't caught — while a genuinely unrelated item scored `0.14`, leaving a wide safety margin at `0.88`. Tunable via env without a code change if further tuning is needed.

**`cosineSimilarity` becomes a shared export.** Move it out of `newsIngestion.scoring.ts` into `newsIngestion.utils.ts` (already the home of hashing/freshness/hash-dedup helpers) and import it from both `newsIngestion.scoring.ts` and the new semantic-dedup function, rather than duplicating the loop.

## Risks / Trade-offs

- **[Risk] A single global threshold may merge genuinely distinct stories that happen to be topically close (e.g. two different articles about the same product launch).** → Mitigation: threshold defaults conservative (0.93); this is a hackathon-scope heuristic, not a claim of perfect duplicate detection — false negatives (missed duplicates) are preferred over false positives (dropped distinct stories).
- **[Risk] Recently-stored pool grows unbounded if the freshness window is large or ingestion volume spikes.** → Mitigation: bounded by the same `NEWS_INGESTION_MAX_AGE_HOURS` window already used for staleness (default 72h), consistent with existing scale assumptions in the archived design.
- **[Trade-off] Greedy in-run comparison (against accepted-so-far, not full pairwise) can be order-dependent** — which of two near-duplicate in-run items is seen "first" affects the comparison path, though the final keep/discard decision is still driven by engagement, not arrival order. Acceptable given the alternative (full O(n²) pairwise) buys little at this item volume.

## Migration Plan

No data migration — reads only the existing `NewsItem.embedding` field. Steps:
1. Add `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` to `config/index.ts` with a safe default (`0.93`).
2. Export `cosineSimilarity` from `newsIngestion.utils.ts`; update `newsIngestion.scoring.ts` to import it.
3. Reorder `runIngestionPipeline()`: embed `unique` items, run semantic dedup, then relevance/trend scoring on survivors.
4. Verify against a manual `POST /news-items/ingest` run before relying on the cron to exercise it.

**Rollback**: unset/lower `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD` to effectively disable (e.g. `1.0`, unreachable by cosine similarity) without reverting code.

## Open Questions

- Whether the engagement-based tie-break (keep higher-engagement duplicate) should instead prefer a source-priority order (e.g. always prefer the original article's own domain over an aggregator repost) — deferred; engagement is a reasonable proxy and doesn't require source-specific ranking logic.
