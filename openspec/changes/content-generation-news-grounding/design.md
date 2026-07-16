## Context

Traced end-to-end while investigating a hallucination-risk concern raised during the news-ingestion adapter work. The actual prompt sent to the content-generation LLM today (`contentGeneration.prompt.ts::buildUserPrompt`), when a `news_item_id` is supplied:

```
Generate content about: "<news item's title>"

Additional context (category: <category>; why it matters: <impact_note>)
```

`NewsItemContext` (`contentGeneration.interface.ts`) only has `category?: string` and `impact_note?: string`. `resolveNewsItemContext` (`contentGeneration.service.ts`) builds that context by fetching the `NewsItem` and returning only those two fields plus its `embedding` (used only for RAG retrieval, not shown to the model). `snippet` and `url` are read nowhere in the content-generation path, despite existing on every stored `NewsItem`.

`impact_note` is not a content summary — `newsIngestion.categorize.ts`'s categorization system prompt asks explicitly for *"one sentence on audience fit"*, a marketing/relevance judgment produced once at ingestion time from `title + snippet`, not a factual recap of the story. So the generation step effectively has: a headline, a category label, and one sentence of audience-fit reasoning — and is asked to write a Facebook post, LinkedIn post, YouTube script (with a hook and chaptered outline), and caption, in the team's own voice and possibly in Bangla. For the kind of items this pipeline actually ingests — small-community posts, tool releases, niche questions — there is no realistic way for the model to know real specifics beyond the title, so it is structurally likely to invent them to make the post sound concrete.

## Goals / Non-Goals

**Goals:**
- Give the generation LLM the actual stored `snippet` (and `url`) for the news item being written about, so it has real source text to reference instead of a bare headline.
- Add an explicit instruction against inventing specifics beyond what's provided, so the model degrades gracefully (writes more generally) rather than fabricating details when the snippet itself is thin.
- Keep the fix scoped to the generation *prompt* — no change to what adapters fetch/store, no change to embeddings, no change to RAG retrieval.

**Non-Goals:**
- Not fetching fuller article/post bodies from source APIs (e.g. Product Hunt's `description` field vs. `tagline`) — that's a separate, already-discussed, deliberately-deferred decision per source, orthogonal to this change. This change only wires up data that's *already stored* and currently discarded at generation time.
- Not changing the embedding pipeline (`title + snippet` for news items stays as-is) — this is purely about what's shown to the generation LLM, not what's used for retrieval/dedup.
- Not adding real-time web fetching/browsing to pull the live article content at generation time — out of scope; this pipeline doesn't do live fetches at generation time for any source, and adding one would introduce latency, cost, and a new failure mode for a single content-generation request.

## Decisions

1. **Widen `NewsItemContext` with `snippet?`/`url?`, not a new parallel field.** Keeps the existing shape (`category`, `impact_note`) and additively extends it — minimal surface change, and `buildUserPrompt`'s existing "only include context if present" branching (`if (!newsContext || (!newsContext.category && !newsContext.impact_note))`) needs a matching update so a news item with a snippet but no category/impact_note (e.g. categorization failed and fell back — see the `fallbackCategorize` path in `newsIngestion.categorize.ts`) still gets its snippet included rather than silently dropped.
2. **Snippet is framed as reference material with an explicit faithfulness instruction, not just appended as another context line.** The risk isn't only "the LLM has no info" — it's also "the LLM confidently extrapolates from thin info." The system prompt gains a rule (alongside the existing voice/language instructions) telling the model to ground factual claims in the provided snippet and not invent specifics (numbers, quotes, feature claims, dates) beyond what's given, and to write more generally rather than fabricate when the snippet itself is sparse. This is a prompt-engineering mitigation, not a hard guarantee — LLMs can still hallucinate despite instruction — but it materially reduces the risk relative to today's zero-grounding baseline.
3. **`url` is included so the model can refer to "the linked post/article" naturally** (e.g. in a caption or reel script) without inventing a fake citation or pretending it browsed a page it never saw. It is not fetched or dereferenced — just passed through as the same URL already stored on the item.
4. **No change to `resolveNewsItemContext`'s soft-fail behavior.** A missing/invalid `news_item_id` still falls back to embedding the raw `topic` string with no context — this change only affects the case where a real `NewsItem` is resolved.
5. **Auto-generation (`generatedContent.job.ts`) needs no code change.** It already calls `generateContent` with `news_item_id` set, so widening `resolveNewsItemContext` automatically improves the daily auto-drafted content too — this is a pure win with no separate wiring needed for that path.

## Risks / Trade-offs

- **[Risk] A thin snippet (e.g. Stack Overflow's tag-list snippet, which is not prose at all) doesn't add much grounding value and could read oddly if quoted directly** → **Mitigation**: the system-prompt instruction frames the snippet as *reference material to stay faithful to*, not text to quote verbatim — the model is expected to use it for grounding, not transcription. A tag-list snippet still tells the model the real topic scope (e.g. "javascript, react, hooks") which is strictly better than title-alone.
- **[Risk] Longer prompts cost marginally more tokens per generation call** → **Mitigation**: negligible — snippets in this pipeline are capped short by design (the whole reason they're not "the whole description," per the earlier discussion) generally under ~500 characters; this adds a small, bounded amount to a single interactive request, not a batch job.
- **[Risk] The anti-hallucination instruction doesn't eliminate hallucination, only reduces it** → **Mitigation**: explicitly scoped as a mitigation, not a fix, in this design; genuinely eliminating it would require either fetching full article text (a much bigger change, deferred) or a fact-checking pass (out of scope). This change is worth doing on its own even as a partial improvement, since today's baseline is zero grounding.

## Migration Plan

- No data migration — reads existing fields, no schema change, no backfill needed.
- **Rollout**: code-only change to three files in `ContentGeneration`; takes effect on next deploy/restart, no config or env var involved.
- **Rollback**: revert the three files — no stored-data implications, since nothing is written differently, only what's read into a prompt.

## Open Questions

- Should the anti-hallucination instruction be a fixed rule always present, or should it scale its strength based on snippet length/quality (e.g. a near-empty snippet triggers a stronger "write generally, do not speculate" framing)? Left as an implementation-time judgment call — start with a single fixed instruction and revisit only if real generated output shows a problem worth tuning for.
