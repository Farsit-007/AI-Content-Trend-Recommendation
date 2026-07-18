# Tasks — Chat Retrieval Topical Coverage

## 1. Backend: repool + rerank

- [x] 1.1 In `chat.retrieval.ts`, change `fetchNewsContext`'s query: filter `lifecycle: 'active'`
      and a recency window (e.g. `created_at >= now - 7d`, configurable), drop the
      `.sort({ current_trend_score: -1 }).limit(30)` pre-filter. Recency window is
      `CHAT_CONTEXT_WINDOW_DAYS` (default 7), configurable per config/index.ts.
- [x] 1.2 Update `rankNewsItems` call site accordingly — it already does pure cosine ranking once
      given a candidate list; no change needed to the ranking function itself, just what's passed
      to it. (`poolSize` param becomes unused/removed if the pre-filter is fully dropped, or
      repurposed as a hard cap on candidates fetched from Mongo for cost control.) Repurposed as
      `CHAT_CONTEXT_POOL_CAP` (default 500), a hard cap on the Mongo fetch, not a relevance filter.
- [x] 1.3 Add/update unit tests in the existing chat retrieval test file: assert a low-trend,
      high-similarity item is selected over a high-trend, low-similarity one.
      (`chat.retrieval.test.ts`, 6/6 passing; `verifyChatRetrieval.ts` also rewritten for the new
      `rankNewsItems` return shape.)
- [ ] 1.4 If real active-item counts make the in-memory fetch noticeably slow in
      `verify:chat-retrieval`/`verify:chat-live`, swap to `$vectorSearch` (mirror the pattern used
      elsewhere in the codebase for vector search) as a follow-up task, not required for the
      initial fix. **Not needed yet** — explicitly deferred per its own task description; no live
      volume data suggesting it's needed.

## 2. Backend: retrieval-quality logging

- [x] 2.1 In `chat.service.ts`, after `fetchNewsContext` resolves, log
      `{ topSimilarity, poolSize, contextCount, teamId }` at `info`.
- [x] 2.2 Pick and document a "low relevance" threshold constant (e.g. cosine < 0.3) purely for
      log-level annotation (not a behavior gate) so logs are greppable for likely-poor answers.
      `CHAT_CONTEXT_LOW_RELEVANCE_THRESHOLD` (default 0.3), documented in `.env.example`.

## 3. Coverage audit (documentation)

- [x] 3.1 List every active adapter/feed (`NewsIngestion/adapters/*`, RSS feed list) and note which
      would plausibly surface a major AI-model-release story (arXiv `cs.AI`, GNews query, HN
      frontpage, relevant RSS feeds).
- [x] 3.2 Record the audit's conclusion (covered / gap) in a short section of
      `VISION-ALIGNMENT-VERIFIED-STATUS-2026-07-18.md` or a new short doc. See
      `CHAT-RETRIEVAL-SOURCE-COVERAGE-AUDIT.md` (new, repo root).
- [x] 3.3 If a clear gap is found (e.g. no source covers X), file it as a follow-up — out of scope
      to add new adapters in this change. Gap documented: no X/Twitter adapter (see audit doc).

## 4. Verification

- [x] 4.1 Run `npm run verify:chat-retrieval` (extend if needed to cover the new pooling logic).
      5/5 checks pass.
- [x] 4.2 Full backend suite green. 518/519 passing (1 pre-existing, unrelated flaky test in
      `newsDedupLedger.integration.test.ts` — an index-build race under full-suite load, passes in
      isolation, untouched by this change; see status report).
- [ ] 4.3 Manual: ask chat about a real recently-ingested but not-top-trending item; confirm it's
      grounded correctly. **Not done by this pass** — requires a running server + real ingested
      data; `npm run verify:chat-retrieval` (deterministic, unit-level) was run instead as the
      closest available substitute.
