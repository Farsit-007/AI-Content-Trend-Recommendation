## Why

Change 7A gave long-form generation real length/structure control per format, but grounding is still limited to a news item's short `snippet` (and `category`/`impact_note`). Plan 4 already ingests the fuller `content` field for most sources (full article text where extractable). The vision (V6/V9) wants content that reads as if written by someone who actually read the source, not paraphrased from a one-line snippet. This change adds a facts-then-write step: extract a bounded, verifiable fact sheet from the item's stored `content` once, and ground every format's write call in that fact sheet instead of (or in addition to) the thin snippet.

## What Changes

- `resolveNewsItemContext` additionally returns `content` and `content_status` from the resolved `NewsItem`.
- When resolved content is at least `CONTENT_FACTS_MIN_CHARS` (default 800) characters, a cheap extraction call (standard model, temperature 0.2, strict JSON `{ summary, facts[] }`, input capped at `CONTENT_FACTS_INPUT_MAX_CHARS` default 12000) produces a fact sheet.
- The fact sheet is cached in Redis per news item (`facts:<id>`, 7-day TTL) — shared across every team and every format generating from that item, so the marginal cost is one cheap call per item per week, not per team or per format.
- The fact sheet is injected into every requested format's user prompt as a "Key facts from the source" block, and the system's grounding instruction is updated to reference it.
- **Extraction soft-fails by design:** any LLM or parse failure logs a warning and generation proceeds exactly as it does today (snippet-grounded only) — extraction is enrichment, never a gate. Short or absent content skips extraction entirely (no wasted call).

## Capabilities

### Modified Capabilities
- `content-generation`: extends the existing "News-Item-Grounded Content Generation" requirement (from `content-generation-news-grounding`) — snippet-only grounding becomes fact-sheet grounding when the item's stored content is long enough, with the pre-existing snippet-fallback behavior preserved unchanged for thin/absent content.

## Impact

- Backend: `config/index.ts` (new `CONTENT_FACTS_MIN_CHARS`/`CONTENT_FACTS_INPUT_MAX_CHARS` → `config.content_generation.*`), `contentGeneration.interface.ts` (`NewsItemContext.content`/`content_status`), `contentGeneration.service.ts` (`resolveNewsItemContext` widened; fact-sheet resolution threaded into the per-format write calls), new `contentGeneration.facts.ts` (extraction + Redis-cached wrapper), `contentGeneration.prompt.ts` (`buildUserPrompt` gains an optional `factSheet` param; grounding instruction wording updated).
- Depends on plan 4 (`news-full-content-sources` + `news-content-extraction`, both already applied — `NewsItem.content`/`content_status` exist) and change 7A (`generation-longform-formats`, already applied — per-format calls this change grounds).
- No frontend changes.
