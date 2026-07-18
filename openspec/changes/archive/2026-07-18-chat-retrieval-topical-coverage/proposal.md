# Chat Retrieval Topical Coverage

## Why

Reported: asking chat about "Kimi K3" (a real, currently-trending AI model release) gets "I don't
have information about that" regardless of which LLM is set as the chat task default — the model
swap made no difference, which means the failure is upstream of the model: `fetchNewsContext`
never handed the LLM a Kimi K3 item to ground on. There are two independent possible causes and
this change addresses both: (1) the item may never have been ingested (source-coverage gap), and
(2) even if ingested, the current two-stage retrieval (pre-filter to the **top 30 items by
`current_trend_score` globally**, then cosine-rerank only within that pre-filtered set) can starve
a topically-relevant item that hasn't yet accumulated a high trend score relative to unrelated
high-engagement items (e.g. a popular GitHub release). Today there is no visibility into which of
the two happened for a given failed answer — this change adds both a retrieval fix and the
diagnostics to tell them apart next time.

## What Changes

- Widen/redesign `fetchNewsContext`: instead of pre-filtering to top-30-by-trend-score before
  reranking, rank by semantic similarity across a materially larger recent-and-active pool (e.g.
  last `NEWS_INGESTION_MAX_AGE_HOURS`-equivalent window, active lifecycle, no trend pre-filter), then
  take the top N by similarity. If pool size becomes a real cost concern, use the existing
  `$vectorSearch` capability (already used elsewhere in the codebase for other retrieval) instead of
  in-memory cosine over a fetched batch.
- Log (structured, at `info` level) whenever chat context retrieval returns zero or low-similarity
  results for a question, including the top similarity score achieved — turns "the assistant didn't
  know X" from unfalsifiable into a diagnosable log line (retrieval found nothing relevant vs. found
  something but the model still refused).
- Audit source coverage for AI-model-release news specifically (arXiv query breadth, GNews queries,
  RSS feed set) and confirm at least one adapter would plausibly pick up a major model release
  within the ingestion cadence; document the finding.
- No prompt or model changes — `buildSystemPrompt`'s "ground in context, say so if insufficient" is
  the correct behavior; the fix is making sure sufficient context reaches it when it genuinely
  exists.

## Capabilities

### New Capabilities
- `chat-context-retrieval`: pooling/ranking behavior for chat's news-grounding step and its
  diagnosability requirements.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- `backend/src/app/modules/Chat/chat.retrieval.ts` (`fetchNewsContext`, `rankNewsItems` pool
  strategy).
- `backend/src/app/modules/Chat/chat.service.ts` (log the retrieval-quality signal alongside the
  existing LLM-call error logging).
- Possibly `backend/src/scripts/verifyChatRetrieval.ts` (already exists) extended to cover the
  wider-pool behavior.
- No frontend changes — this is entirely a backend retrieval-quality fix.
