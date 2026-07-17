## 1. Widen the context type and resolution

- [x] 1.1 `contentGeneration.interface.ts`: add `snippet?: string` and `url?: string` to `NewsItemContext`
- [x] 1.2 `contentGeneration.service.ts`'s `resolveNewsItemContext`: include `newsItem.snippet` and `newsItem.url` in the returned `context` object alongside the existing `category`/`impact_note`

## 2. Update the prompt

- [x] 2.1 `contentGeneration.prompt.ts`'s `buildUserPrompt`: extend the "does this item have any context worth including" check to also account for `snippet`/`url` (currently `if (!newsContext || (!newsContext.category && !newsContext.impact_note))` — a news item with only a snippet and no category/impact_note, e.g. one whose categorization fell back, must not have its snippet silently dropped by this check)
- [x] 2.2 Include the snippet text in the user message as reference context (e.g. a `source snippet: "<snippet>"` line alongside the existing `category`/`why it matters` lines) and include the `url` (e.g. `source: <url>`) so the model can refer to "the linked post" naturally
- [x] 2.3 `buildSystemPrompt`: add an anti-hallucination instruction — ground factual claims in the provided snippet/context, do not invent specific facts, numbers, quotes, or dates beyond what's given, write more generally rather than fabricate when the snippet is thin. Add this as its own instruction block so it applies in both the cold-start (no brand-voice examples) and warm branches of `buildSystemPrompt`

## 3. Tests

- [x] 3.1 Extend or add to `contentGeneration`'s test suite (check `backend/src/__tests__/` for existing content-generation tests to match style): `buildUserPrompt` includes snippet/url text when present on `NewsItemContext`; a `NewsItemContext` with only a snippet (no category/impact_note) still produces prompt output including that snippet, not the bare-topic fallback; a `NewsItemContext` with nothing set at all (or `undefined`) still falls back to the original bare-topic prompt, unchanged
- [x] 3.2 Test `resolveNewsItemContext` (or the service-level integration) pulls `snippet`/`url` off a resolved `NewsItem` alongside `category`/`impact_note`
- [x] 3.3 Confirm the missing/invalid `news_item_id` fallback path (topic-only, no news context) is unaffected — existing test coverage for this path should still pass unmodified

## 4. Verification

- [x] 4.1 `cd backend && npm test && npm run build`
- [x] 4.2 Manual check: call `POST /content/generate` with a real `news_item_id` for an item that has a non-trivial `snippet` (e.g. a Product Hunt or Mastodon item) and read the generated `facebook_post`/`linkedin_post` output — confirm it references details plausibly drawn from the snippet rather than generic headline-only filler
- [x] 4.3 Manual check: call it again for an item with a thin/empty snippet (e.g. an HN link post with no `story_text`) and confirm the output reads as appropriately general rather than inventing specific claims
- [x] 4.4 Spot-check the auto-generation job (`generatedContent.job.ts`, or trigger it manually if an admin endpoint exists) still runs end-to-end with the widened context — no code change was needed there, but confirm nothing broke
