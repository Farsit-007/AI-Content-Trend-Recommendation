## Why

`POST /content/generate` currently writes Facebook/LinkedIn/YouTube/caption content from a news item using **only its title, category, and a one-sentence "why it matters" note** — `NewsItemContext` (`contentGeneration.interface.ts`) never carries the item's `snippet` or `url`, and `resolveNewsItemContext` (`contentGeneration.service.ts`) never reads them off the `NewsItem` document. The `impact_note` field that does get passed through is itself not a summary of the article — `newsIngestion.categorize.ts`'s system prompt explicitly asks the categorization LLM for "one sentence on audience fit," a marketing judgment, not a factual recap. So the content-generation LLM is asked to write concrete social posts and a YouTube script (hook, chapters, thumbnail concept) from a bare headline plus one sentence of audience-fit reasoning, with no real source text to ground the writing in. For most of what this pipeline ingests (a Lobsters post, a GitHub release, a Product Hunt launch, an obscure Stack Overflow question), the LLM has no way to know real details beyond the title, so it is very likely to invent plausible-sounding specifics — features, numbers, claims — to flesh out the post. This is a genuine hallucination-risk gap, not a deliberate design trade-off: nothing in the shipped `brand-voice-rag` design intentionally excluded `snippet` from the generation prompt.

## What Changes

- Add `snippet` (and `url`) to `NewsItemContext` (`contentGeneration.interface.ts`).
- `resolveNewsItemContext` (`contentGeneration.service.ts`) reads `snippet`/`url` off the resolved `NewsItem`, alongside the existing `category`/`impact_note`.
- `buildUserPrompt` (`contentGeneration.prompt.ts`) includes the snippet as real source text in the user message — framed as reference material the model should stay faithful to, not just another one-line hint — and includes the URL so the model can reference "the linked article/post" without inventing a citation.
- System-prompt instruction added: the model must ground claims in the provided snippet/context and must not invent specific facts, numbers, or quotes beyond what's given — degrade to describing the topic generally rather than fabricating specifics when the snippet is thin.
- No change to the embedding pipeline, retrieval (RAG few-shot examples), or the categorization step itself — this only widens what the *generation* step is shown, using data that's already stored on every `NewsItem`.

**Capabilities:** MODIFIED `content-generation` (the capability shipped by `brand-voice-rag`, never synced to `openspec/specs/` — this delta restates the full requirement per this repo's established convention for un-synced capabilities).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `content-generation`: `POST /content/generate`'s news-item grounding is widened from title+category+impact_note to include the item's stored `snippet` and `url`, with an explicit anti-hallucination instruction added to the system prompt.

## Impact

- `backend/src/app/modules/ContentGeneration/contentGeneration.interface.ts` — `NewsItemContext` gains `snippet?: string` and `url?: string`.
- `backend/src/app/modules/ContentGeneration/contentGeneration.service.ts` — `resolveNewsItemContext` reads the two new fields.
- `backend/src/app/modules/ContentGeneration/contentGeneration.prompt.ts` — `buildUserPrompt` includes the snippet/url; `buildSystemPrompt` (or a shared instruction block) gains the anti-hallucination rule.
- No database schema change — `snippet` and `url` already exist on every `NewsItem` document; this only reads fields that were already being stored and thrown away at generation time.
- No change to `GeneratedContent`'s auto-generation job (`generatedContent.job.ts`) — it already passes `news_item_id`, so it benefits automatically once `resolveNewsItemContext` is widened.
- Existing behavior noted but explicitly **out of scope for this change** (raised separately, deferred): some sources' `snippet` is itself short (e.g. Product Hunt's tagline vs. its fuller `description` field) — widening what individual adapters *store* is a separate, source-by-source decision already discussed and deliberately deferred.
