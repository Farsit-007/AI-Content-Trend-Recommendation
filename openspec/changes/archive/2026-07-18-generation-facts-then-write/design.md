## Context

`resolveNewsItemContext` (`contentGeneration.service.ts:80-100`) currently returns `{ embedding?, context?: { category, impact_note, snippet, url } }` from a resolved `NewsItem` — it never reads `content`/`content_status`, even though plan 4 populated those fields on the stored document for most sources (full article text where extractable, `content_status: 'full'|'partial'|'failed'|'none'`). `buildUserPrompt` (`contentGeneration.prompt.ts:81-97`) renders `category`/`impact_note`/`snippet`/`url` as one "Additional context (...)" line; `GROUNDING_INSTRUCTION` in the system prompt tells the model to stay faithful to "a snippet and/or 'why it matters' note." Neither reads or references the fuller `content`.

Pasting 20k characters of raw article content directly into the write prompt would dwarf the style examples and dilute style transfer (the exact failure mode 6B's block ordering was designed to avoid), and would be wasteful — re-paying that cost on every team's and every format's generation of the same item. A separate, cheap, cached extraction step avoids both problems.

## Goals / Non-Goals

**Goals:**
- Ground long-form output in the item's real stored content when available, via a bounded, verifiable fact list rather than pasting raw content.
- Amortize the extraction cost across every team and format generating from the same item (Redis-shared, 7-day TTL).
- Fail soft at every step — extraction is enrichment, generation must never fail or degrade because facts didn't extract.

**Non-Goals:**
- Any change to `NewsItem`, the ingestion pipeline, or plan 4's `content`/`content_status` fields — this change only reads them.
- Per-format fact tailoring (the same fact sheet is injected into every requested format's prompt, unmodified).
- Regeneration/refine/manual-draft persistence (change 7C).
- Any change to embedding, retrieval ranking, or cache-key structure beyond what 7A already shipped.

## Decisions

1. **A separate extraction call, not pasting content into the write prompt.** (a) 20k chars of source would dwarf the style examples and dilute style transfer; (b) facts extracted once serve *every* format and *every* team generating from that item (Redis-shared), so the marginal cost is one cheap call per news item per week, not per generation; (c) a bounded fact list is exactly what an anti-hallucination instruction can anchor to — an LLM asked to "stay faithful to 20k characters" grounds worse than one asked to "stay faithful to these 8 bullet points."

2. **Fact-sheet contract:** `{ "summary": "<≤3 sentences>", "facts": ["<≤200 chars>", … 5-10 items] }`. The extractor prompt mirrors `categorizeOneBatch`'s (`newsIngestion.categorize.ts`) strict-JSON discipline: fence-strip, `JSON.parse`, validate shape, `null` on any deviation (wrong type, missing key, empty array) — no partial-object fallback, matching this codebase's established "malformed response is a hard failure, not partial content" convention. Facts are written in neutral English regardless of the requested output language — they are reference data for the write call, not copy; the write call's own language instruction governs what the model produces.

3. **Threshold rationale:** below roughly 800 characters, the snippet already carries everything worth grounding on — an extra call buys nothing. Two new config keys under a new `config.content_generation` namespace (mirroring the existing `config.analytics`/`config.auto_generation` style-object pattern): `CONTENT_FACTS_MIN_CHARS` (zod string default `'800'`) and `CONTENT_FACTS_INPUT_MAX_CHARS` (default `'12000'`, the cap on how much of `content` is fed to the extractor — content longer than this is truncated before the call, not rejected).

4. **Cache placement:** `facts:${newsItemId}` via `redis.setex(..., 604800, ...)` (7 days) — keyed by item id alone, since facts are team/language/format-independent by construction (they describe the source article, not any particular generation request). Regenerate/refine (change 7C) never need to bypass this cache — facts don't go stale within an item's practical lifetime, and the retention plan removes the item from the working set well before 7 days matter. This is deliberately a *different* cache namespace from the per-format `content:...` keys 7A added — facts are a shared input to generation, not a per-request output.

5. **Prompt injection point — `buildUserPrompt` gains an optional `factSheet` param**, rendering after the existing context line:
   ```
   Generate content about: "<topic>"

   Additional context (category: ...; why it matters: ...; source snippet: "..."; source: ...)

   Key facts from the source (ground your claims in these; do not invent beyond them):
   - <fact 1>
   - <fact 2>
   ...
   Summary: <summary>
   ```
   Rendering is identical across every format that requests it — `buildMessages` threads the same `factSheet` into every format's `buildUserPrompt` call for a given `generateContent` invocation. `GROUNDING_INSTRUCTION`'s wording is extended with a clause referencing "the provided fact list" so the system prompt and the user-prompt facts block reinforce each other.

6. **Failure = absence, not a request error.** Any extractor throw, timeout, or invalid-shape response → `logger.warn` once per request-that-needed-it, `factSheet` stays `undefined`, and generation proceeds exactly as change 7A left it (snippet-grounded, or brand-neutral/topic-only if that's already the case). No retries — `chatCompletion`'s existing model-fallback already covers transport-level failures; a second retry layer on top would just be redundant cost for a call this cheap and this non-critical.

7. **Where this slots into `generateContent`:** after the existing `resolveNewsItemContext(payload.news_item_id)` call (which now also returns `content`/`content_status`), and only when there is at least one cache miss to fill (mirroring 7A's "only do retrieval work when something actually needs generating" optimization — a fully-cached request touches neither the news item nor the fact cache). The resolved `factSheet` (or `undefined`) is passed into every miss format's `buildMessages` call alongside the existing `newsContext`/`styleContext`.

## Risks / Trade-offs

- **[Extraction adds one more LLM call to the first generation for a content-rich item]** → mitigated by the 7-day shared cache; the *next* team or format generating from the same item pays zero extraction cost. Bounded further by the min-chars threshold skipping thin items entirely.
- **[Facts could be wrong or incomplete if the extractor misreads the source]** → same class of risk as any LLM call; mitigated by capping fact count/length (keeps claims checkable) and by soft-fail (a bad extraction that fails validation is treated as no extraction, not injected garbage — this only degrades to today's snippet-grounded behavior, never worse).
- **[7-day TTL could serve stale facts if a news item's stored content is later corrected]** → accepted; this repo's `NewsItem` documents are not expected to be edited post-ingestion in normal operation, and the retention plan's working-set window is shorter than 7 days in practice.

## Migration Plan

- Purely additive: no schema change (reads existing `NewsItem.content`/`content_status`), new Redis key namespace (`facts:*`, independent of the `content:*` generation cache), one new config namespace. No backfill — the first generation for any given item populates its fact-sheet cache entry.
- Rollback is a plain revert; any live `facts:*` Redis keys simply age out within 7 days if the feature is reverted, no cleanup required.

## Open Questions

None — thresholds, cache placement, and failure semantics are fully pinned by the plan's design decisions.
