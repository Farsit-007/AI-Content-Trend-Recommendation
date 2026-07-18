## Why

Facebook and LinkedIn content needs to be "big content" that "should not feel like AI generated" (vision V6/V9/V10). Today one LLM call must emit all five formats as a single strict-JSON blob — this caps effective per-format length, mixes formatting concerns, and is the current 502 failure mode: JSON-wrapping a long Bangla post invites escaping errors and mid-string truncation on free-tier models. There are also no length/structure directives for any format, so output reads generic regardless of style pack.

## What Changes

- `POST /content/generate` gains `formats?: FormatId[]` — a non-empty unique subset of `facebook_post`, `linkedin_post`, `facebook_reel_script`, `youtube_idea`, `caption`; default `["facebook_post","linkedin_post"]`.
- Each requested format becomes its own LLM call carrying a format-specific system suffix: Facebook post 150-400 words (hook first line), LinkedIn post 1,200-2,500 characters (paragraph breaks, 3-5 hashtags), reel script scene/VO structure, caption ≤200 characters, YouTube idea unchanged (structured object).
- **Text formats return and are parsed as plain text, not JSON** — eliminating the JSON-truncation/escaping failure mode for long output. Only `youtube_idea` keeps a strict JSON contract.
- Shared anti-AI-tell style instructions (varied sentence length, concrete hooks, no formulaic closers) join the system prompt for text formats only.
- Caching becomes per-format (`…:${format}`), so a later on-demand format (e.g. `caption` requested after the primary pair) costs exactly one call and never invalidates sibling formats.
- `GeneratedContent` (API response type and the Mongo `formats` subdoc) becomes partial — any non-empty subset of formats is valid, not all five. The auto-generation job stores the new default pair (`facebook_post`, `linkedin_post`).
- Calls for the requested formats run concurrently; failure is all-or-nothing (any format failing → 502, no cache writes for this request's misses) — a partially-filled result would teach users to distrust the button.
- Boot-time warning when `LLM_MODELS.fallback === LLM_MODELS.content` (failover silently disabled today in some environments).
- **Manual verification gate for this change:** the long-deferred Bangla content-model bake-off (3 topics × current free-tier baseline vs. ≥2 stronger candidates, native-speaker scored) — the chosen model is recorded in this change's notes before archiving.

## Capabilities

### Modified Capabilities
- `content-generation`: `POST /content/generate`'s response contract and prompt construction change from "one call, five required formats" to "one call per requested format, any non-empty subset." This modifies the "Generate multi-format content from a topic" and "Single structured generation call with strict validation" requirements shipped by the original `brand-voice-rag` change — a deliberate breaking change with zero current external consumers (no frontend depends on the old five-key shape yet).
- `content-generation-cache`: the cache key gains a `:{format}` segment so per-format entries can be read/written independently.
- `generated-content`: the `formats` subdoc on stored drafts becomes partial (any non-empty subset), and the auto-generation job stores the new default pair instead of all five formats.

## Impact

- Backend: new `contentGeneration.formats.ts` (format registry); `contentGeneration.prompt.ts` (per-format `buildMessages`, anti-AI-tell block, delete the all-5 response-shape instruction); `contentGeneration.parse.ts` (plain-text parser replaces `parseGeneratedContent`); `contentGeneration.interface.ts`, `contentGeneration.validation.ts`, `contentGeneration.service.ts` (per-format cache read/call/write); `generatedContent.model.ts`/`.interface.ts` (formats fields become optional); `generatedContent.job.ts` (stores the new default pair); `lib/llmClient.ts` (boot warning); `docs/schemas.ts` + `docs/contentGenerationPaths.ts` (reflect the new request/response contract).
- Test infra: `support/openrouterMock.ts` gains a multi-call sequence helper; `contentGeneration.integration.test.ts` is substantially rewritten for the new default response shape.
- Depends on change 6B (`style-packs-generation`) already being applied — it is (this change extends 6B's `buildMessages`/cache-key structure rather than reworking it from scratch).
- No frontend changes.
