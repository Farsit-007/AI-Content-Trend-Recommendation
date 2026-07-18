# Design — Chat Retrieval Topical Coverage

## Context

**Overlaps with `team-readiness-gating`:** that change adds an early return in `chat.service.ts`
for not-ready teams (before `fetchNewsContext`/`embedForTask`/`chatCompletionForTask` are called at
all). This change's edits are entirely inside/after that call. Implement in either order without
conflict as long as the readiness short-circuit stays the very first thing `askChat` does — the
pooling change here only matters for teams that get past it.

`fetchNewsContext` (`chat.retrieval.ts:59-70`) fetches `NEWS_TREND_POOL_SIZE=30` items sorted by
`current_trend_score` descending, with **no lifecycle filter** (archived items can be in the pool)
and no category/team scoping, then `rankNewsItems` cosine-reranks only within those 30 and returns
the top 5. This is a hard pre-filter: an item ranked #31 by trend score never gets a chance to be
scored for topical relevance, no matter how well it matches the question. Trend score is
log-scaled engagement + decay + velocity (`newsIngestion.scoring.ts`) — it reflects how much the
internet is currently reacting, not how canonically important or recent a story is, so a
correctly-ingested-but-modestly-engaged item (e.g. a niche model release covered by one blog before
going viral) is exactly the kind of item this pre-filter drops.

## Goals / Non-Goals

**Goals:**
- A topically relevant, recently-ingested item should reach the LLM regardless of its trend-score
  rank.
- Make "context wasn't found" observable in logs without needing to reproduce the exact question.

**Non-Goals:**
- No change to trend scoring itself (`newsIngestion.scoring.ts`) — that's for the feed's ranking,
  a different concern.
- No guarantee that every possible topic is ingested — source coverage is a separate, ongoing
  concern (audited, not solved, by this change).
- No per-team scoping added to chat retrieval in this change (today's `fetchNewsContext` is
  global) — team-scoping chat context is a separate product decision, tracked only if it comes up.

## Decisions

1. **Replace the trend-score pre-filter with a recency+lifecycle filter, then rank purely by
   semantic similarity.** Concretely: fetch active items from the last N days (reuse
   `NEWS_INGESTION_MAX_AGE_HOURS`-scale window, e.g. 7 days, wider than the feed's own archive
   ceiling so nothing relevant is excluded just because it archived), rank all of them by cosine
   similarity to the question, take top `NEWS_LIMIT`. Alternative considered: keep the trend
   pre-filter but raise `NEWS_TREND_POOL_SIZE` from 30 to e.g. 200 — rejected as a band-aid that
   still silently drops low-trend/high-relevance items, just at a higher threshold.
2. **Prefer `$vectorSearch` over in-memory fetch+cosine once the active-item count materially
   exceeds a few hundred** (mirrors how other retrieval paths in this codebase already use vector
   search) — implemented as a follow-up if the in-memory version proves too slow at real data
   volumes; the spec requirement is about ranking correctness, not the implementation mechanism.
3. **Log retrieval quality, not just LLM failures.** After ranking, log
   `{ topSimilarity, poolSize, contextCount }` at `info` (not `warn`, this isn't necessarily a
   problem — most questions won't have a perfect match) so a support/debugging pass can grep for
   "chat answered X, retrieval top similarity was low" to distinguish "nothing relevant existed"
   from "relevant context existed but the model ignored it."
4. **Source-coverage audit is a documentation task, not a code change** — confirm which adapters
   (arXiv `cs.AI` query, GNews `artificial intelligence` query, HN/Reddit/RSS) would plausibly
   surface a named-model-release story, and note any obvious gap (e.g. no adapter tracks
   Twitter/X, which is often where model releases break first) as a known limitation, not silently.

## Risks / Trade-offs

- [Wider pool = more embeddings compared in-process] → cosine similarity over a few hundred
  384–1536-dim vectors is still cheap (microseconds); only revisit if the active-item count grows
  an order of magnitude (Decision 2 covers that).
- [Recency window vs. trend pool size tradeoff — a very old but still-relevant reference item now
  drops out where it wouldn't have under score-based ranking] → acceptable: chat is framed as
  "trending news Q&A," not a general knowledge base; the system prompt already says as much.

## Migration Plan

Backend-only, no data migration. Deploy and verify via the existing
`verify:chat-retrieval`/`verify:chat-live` scripts against real ingested data.

## Open Questions

- Should chat retrieval eventually be team-scoped by category the way the feed is? Deferred to
  `team-readiness-gating`'s follow-through, not decided here.
