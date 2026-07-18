## 1. Format definitions

- [x] 1.1 `contentGeneration.formats.ts`: add `preferredPlatform?: 'facebook' | 'linkedin'` to `ContentFormatDefinition`; set `facebook_post`, `facebook_reel_script`, `caption` → `'facebook'`; `linkedin_post` → `'linkedin'`; leave `youtube_idea` unset

## 2. Retrieval

- [x] 2.1 `contentGeneration.retrieval.ts`: extend `StyleExampleCandidate` with `platform: 'facebook' | 'linkedin' | 'other'`; add `fetchStylePackExamples(packId): Promise<StyleExampleCandidate[]>` — the DB read only (projection adds `platform`), no ranking
- [x] 2.2 `contentGeneration.retrieval.ts`: extend `rankStyleExamples(candidates, topicEmbedding, preferredPlatform?, limit = STYLE_EXAMPLE_LIMIT)` — no `preferredPlatform` behaves exactly as today (existing signature/behavior preserved for any other caller); with a `preferredPlatform`, partition into matches/non-matches, rank matches by similarity first (up to `limit`), backfill remainder from non-matches by similarity
- [x] 2.3 Keep (or thin-wrap) `fetchTopStyleExamples` only if any other call site still needs the fetch+rank-in-one convenience; otherwise remove it in favor of the two split functions now that `contentGeneration.service.ts` is the only caller — removed; `contentGeneration.service.ts` is the only caller and now uses the two split functions directly

## 3. Service wiring

- [x] 3.1 `contentGeneration.service.ts`: in the miss-handling block, when `stylePack` resolved, call `fetchStylePackExamples(packId)` once (parallel with the existing brand-voice/fact-sheet work where possible) instead of calling `fetchTopStyleExamples` inline
- [x] 3.2 `contentGeneration.service.ts`: move `styleContext` construction inside the per-format `misses.map(...)` callback, computing `examples` via `rankStyleExamples(stylePackExamples, topicEmbedding, CONTENT_FORMATS[format].preferredPlatform)` per format; `card` stays the pack's `style_card` (format-independent, unchanged)
- [x] 3.3 Confirm the no-pack path is untouched: `styleContext` remains `undefined` when no pack resolved, with no `fetchStylePackExamples` call made at all

## 4. Tests

- [x] 4.1 `contentGeneration.retrieval.test.ts` (new): unit tests for `rankStyleExamples`'s platform-preference path — matches ranked first, backfill fills remainder, all-`other` corpus equals plain-similarity output, matches exceeding the limit never pull in non-matches, no-`preferredPlatform` call byte-identical to pre-change output for the same inputs (5 tests, all passing)
- [x] 4.2 `contentGeneration.integration.test.ts`: two formats (`facebook_post`, `linkedin_post`) requested in one call against a pack with platform-tagged examples — asserts (via `getChatCompletionRequests`) that each format's prompt contains a distinct, platform-matched example set
- [x] 4.3 `contentGeneration.integration.test.ts`: asserts exactly one `StyleExample.find` call occurs per request regardless of format count (via `jest.spyOn`)
- [x] 4.4 `contentGeneration.integration.test.ts` / `contentGeneration.prompt.test.ts`: no-pack requests and untagged-pack requests produce prompts identical to their pre-change fixtures — regression guard confirmed by (a) the full pre-existing suite passing unchanged and (b) a new explicit "untagged example still surfaces via backfill" integration test
- [x] 4.5 `cd backend && npm test && npm run build` — full suite passes, build clean

## 5. Verification

- [x] 5.1 `cd backend && npm test` — 39 suites, 334 tests, all pass
- [x] 5.2 `cd backend && npm run build` — clean
- [x] 5.3 Live check: seeded a scratch pack with 2 real facebook-tagged and 2 real linkedin-tagged examples via `seed:style-pack`, then ran `fetchStylePackExamples` + `rankStyleExamples` against the live DB with a real embedding for the topic "coding career growth tips". Confirmed: `facebook_post` (preferredPlatform=facebook) selects both facebook-tagged examples first, backfilled with the linkedin ones; `linkedin_post` selects both linkedin-tagged examples first, backfilled with the facebook ones; `youtube_idea` (no preference) falls back to pure similarity, where the LinkedIn "career growth" posts genuinely outscore the Facebook posts against this career-themed topic — exactly the expected, sensible behavior. Full generation through the LLM (not just retrieval) was not additionally observed live due to OpenRouter's free-tier daily rate limit (same external constraint hit during 9A's verification); retrieval — the actual subject of this change — was verified against real data end-to-end.
