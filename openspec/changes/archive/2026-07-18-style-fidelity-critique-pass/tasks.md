## 1. Config

- [x] 1.1 `config/index.ts` raw env schema: `CONTENT_CRITIQUE_ENABLED: z.string().default('false')`, `CONTENT_CRITIQUE_FORMATS: z.string().default('facebook_post,linkedin_post')`
- [x] 1.2 `config/index.ts` derived config: `content_generation.critique_enabled: env.CONTENT_CRITIQUE_ENABLED === 'true'`, `content_generation.critique_formats: FormatId[]` parsed by comma-split + trim (mirroring the existing `NEWS_INGESTION_RSS_FEEDS` pattern)
- [x] 1.3 `.env.example`: documented both vars under the existing "Content generation" section, including the default-off rationale and a pointer to `BANGLA-QUALITY-DECISION.md`

## 2. Critique module

- [x] 2.1 `contentGeneration.critique.ts`: fixed critique system-prompt template (style card interpolated) per design.md decision 2 — identify-and-rewrite-only contract, mirroring `REFINE_EDITING_CONTRACT`'s conservatism
- [x] 2.2 `contentGeneration.critique.ts`: pure guard functions — `isWithinLengthBand` (0.5x-1.6x), `hasStableScriptRatio` (Bangla-only, ≤50% relative drop), `isNonEmpty`
- [x] 2.3 `contentGeneration.critique.ts`: `critiqueText(draft, styleCard, voiceOptions): Promise<string>` — soft-fail wrapper, one `chatCompletion` call (temperature 0.4), returns the draft unchanged on any error or guard failure, warns via logger
- [x] 2.4 `contentGeneration.critique.ts`: `isCritiqueEligible(format, stylePack): boolean` — **design refinement during apply**: split into two functions rather than one, since the bake-off harness needs eligibility *independent* of the live `critique_enabled` flag (gating `--critique both` on the flag would always produce zero critiqued cells, defeating its own purpose). `isCritiqueStructurallyEligible(format, stylePack)` — text-kind + resolved pack, no flag check — is the new pure/exported function the harness uses; `isCritiqueEligible` composes it with the flag + configured-format-list checks for live serving. Both fully unit-tested.

## 3. Service wiring

- [x] 3.1 `contentGeneration.service.ts`: in the per-format `misses.map(...)` callback, after `parseFormatValue` succeeds, calls `isCritiqueEligible(format, stylePack)`; when true (and the parsed value is a string), calls `critiqueText(parsed, stylePack!.style_card, voiceOptions)` and uses its result as the cached/returned value
- [x] 3.2 Confirmed `regenerate: true` naturally re-runs the pass (unchanged miss-path control flow) and a cache hit makes zero critique calls (verified via dedicated cache-correctness test, task 6.4)

## 4. Bake-off harness extension

- [x] 4.1 `contentGeneration.bakeoff.ts`: `BakeoffCell` gained `critiqued: boolean`; `RunBakeoffMatrixOptions` gained `critique?: 'off' | 'both'` (default `'off'`)
- [x] 4.2 `contentGeneration.bakeoff.ts`: when `critique: 'both'` and a cell is structurally eligible (`isCritiqueStructurallyEligible`) and the base cell succeeded, `runBakeoffMatrix` produces a second, `critiqued: true` cell via `critiqueText` — no separate try/catch needed since `critiqueText` never throws (soft-fails internally to the draft)
- [x] 4.3 `contentGeneration.bakeoff.ts`: documented in the `critique` option's own doc comment that the existing caps bound the pre-doubling matrix, not the final cell count
- [x] 4.4 `scripts/banglaBakeoff.ts`: `--critique both` flag parsing, validated (rejects unknown values), passed through to `runBakeoffMatrix`, reflected in the run-summary log line

## 5. Decision doc

- [x] 5.1 `BANGLA-QUALITY-DECISION.md`: added a "Critique pass enable/disable decision" section — how to gather `--critique both` evidence, the independent-blinding rationale, a concrete enable threshold (≥1.0 point AI-tell-absence improvement, no more than 0.5-point regression elsewhere), and an empty decision-record table. Also updated the pre-existing "AI-tell absence scores poorly" line in the main decision rule, since it previously described this pass as a future trigger condition that hadn't been built yet — now points at the shipped mechanism.

## 6. Tests

- [x] 6.1 `contentGeneration.critique.test.ts` (new, 21 tests): guard unit tests — length band boundaries (exact 0.5x/1.6x pass, just outside fails, empty draft fails), script-ratio stability (stable passes, heavy English drift fails, non-Bangla languages skip the check, empty-Bangla-draft doesn't block), empty-result rejection; `isCritiqueStructurallyEligible` (text-kind + pack, independent of the flag) and `isCritiqueEligible` (all four gate conditions, each independently `false`, all-met `true`) fully covered
- [x] 6.2 `contentGeneration.critique.test.ts`: `critiqueText` soft-fail — LLM error (both primary+fallback) → draft unchanged; oversized/empty/script-drifted response → draft unchanged; valid response within guards → critiqued text returned
- [x] 6.3 `contentGeneration.integration.test.ts` (extended, +6 tests): flag off → 1 call, unchanged output; flag on + eligible + pack → 2 calls, critiqued text returned; flag on + no pack → 1 call; flag on + `youtube_idea` → 1 call; flag on has zero effect on `/content/refine`; all passing
- [x] 6.4 `contentGeneration.integration.test.ts`: cache correctness — critiqued text is what's cached (2 calls on first request), a follow-up identical request hits the cache with the critiqued text and makes zero further calls
- [x] 6.5 `contentGeneration.bakeoff.test.ts` (extended, +3 tests): `critique: 'both'` doubles the eligible (text-kind) cell but not the ineligible (`youtube_idea`) cell in the same run, correctly tagged; `critique: 'off'` (default) never doubles; a critique-step failure records the pre-critique draft as the critiqued cell rather than aborting the run
- [x] 6.6 `cd backend && npm test && npm run build` — 382/382 tests pass, build clean

## 7. Verification

- [x] 7.1 `cd backend && npm test` — 382/382 pass
- [x] 7.2 `cd backend && npm run build` — clean
- [x] 7.3 Live check: `CONTENT_CRITIQUE_ENABLED` is unset in `.env` (schema default `false`), so every live generation call today already exercises the flag-off path by construction — no separate check needed beyond the existing test suite and the unaffected behavior observed throughout 7.5's run's base (non-critiqued) cells.
- [x] 7.4 + 7.5 combined into one live run: `npm run verify:bangla-bakeoff -- --models nvidia/nemotron-3-ultra-550b-a55b:free --pack critique-scratch-9d --formats facebook_post --critique both` against real Atlas/OpenRouter, all 6 default topics. Result: 11 cells (5 successful topics × 2 = 10 paired base/critiqued cells + 1 topic that errored on its base call, correctly producing **no** critiqued twin — confirming the "only attempt critique when the base succeeded" design point). Inspected a real before/after pair: the critique pass caught and fixed a genuine model glitch (a stray Cyrillic character "бизনেস" corrected to proper Bangla "বিজনেস") plus made sensible tightening edits, while preserving facts/structure/language — a real, working demonstration, not just a mocked assertion. Confirmed via `grep -c` zero occurrences of the model name in the review Markdown, and confirmed the 11 sample labels (A1-K1) show no positional pattern that would reveal which are critiqued/non-critiqued pairs — independent blinding held under real doubled-cell load. Scratch pack and output files cleaned up afterward.
- [x] 7.6 Explicitly out of scope for this change's verification (per design.md Open Questions), confirmed still true: making the actual enable/disable decision from real paired evidence and recording it in `BANGLA-QUALITY-DECISION.md` — that requires a real Track-0 corpus and reviewer time, tracked separately. The mechanism itself is now fully verified as working correctly.
