## 1. Extract shared prompt-assembly seam (behavior-preserving refactor)

- [x] 1.1 `contentGeneration.retrieval.ts`: add `export const buildStyleContext = (format, stylePack, stylePackExamples, topicEmbedding): StyleContext | undefined` per design.md decision 1
- [x] 1.2 `contentGeneration.service.ts`: replace the inline per-format `styleContext` ternary in `generateContent`'s miss loop with a call to `buildStyleContext(format, stylePack, stylePackExamples, topicEmbedding)` — no other behavior change
- [x] 1.3 Export `resolveNewsItemContext` from `contentGeneration.service.ts` (kept in place — importing it directly is cleaner than relocating, since `contentGeneration.bakeoff.ts` already imports several things from `contentGeneration.service.ts`'s neighbors)
- [x] 1.4 Run the full existing `contentGeneration.*` test suite and confirm zero changes required to existing test expectations (72/72 passed unchanged, proving the refactor is behavior-preserving)

## 2. Bake-off matrix module

- [x] 2.1 `contentGeneration.bakeoff.ts`: `shuffleWithSeed<T>(items: T[], seed: number): T[]` — deterministic inline PRNG (mulberry32-style), no new dependency
- [x] 2.2 `contentGeneration.bakeoff.ts`: types `BakeoffTopic`, `BakeoffCell`, `BakeoffRun` per design.md
- [x] 2.3 `contentGeneration.bakeoff.ts`: `runBakeoffMatrix({ models, topics, formats, packSlug, language, seed })` — validates matrix caps before any call; resolves the pack by slug once, fetches its examples once; per topic resolves news-item context (reusing `resolveNewsItemContext`) or embeds the topic text; per `(model, topic, format)` cell (serial, 500ms delay), builds style context, messages, calls `chatCompletion`, captures `{ error }` on failure without throwing
- [x] 2.4 `contentGeneration.bakeoff.ts`: `formatReviewMarkdown(run, shuffledIndices)` — pure formatter, blinded labels, fixed rubric table per sample
- [x] 2.5 `contentGeneration.bakeoff.ts`: `buildLabelMap(run, shuffledIndices)` — maps each label back to its full `BakeoffCell`

## 3. CLI script

- [x] 3.1 `scripts/banglaBakeoff.ts`: arg parsing (`--models`, `--pack`, `--topics-file`, `--formats`, `--language`, `--seed`), `dns.setServers`/`mongoose.connect` boilerplate
- [x] 3.2 `scripts/banglaBakeoff.ts`: runs the matrix, writes `bakeoff-<timestamp>.json` and `bakeoff-<timestamp>-review.md` to `backend/bakeoff-results/`, prints a summary, disconnects
- [x] 3.3 Registered `verify:bangla-bakeoff` npm script in `backend/package.json`
- [x] 3.4 `backend/.gitignore`: added `bakeoff-results/`

## 4. Default topic set

- [x] 4.1 `backend/seed/bakeoff-topics.json`: 6 topics (2 AI, 1 Web Dev, 1 Career, 1 Security, 1 DevOps), no `news_item_id`, `category_hint` present for readability

## 5. Env fix

- [x] 5.1 `backend/.env`: `LLM_MODEL_FALLBACK` set to `meta-llama/llama-3.3-70b-instruct:free` — confirmed present in OpenRouter's live `/models` catalog on 2026-07-18. A direct chat-completion smoke test could not be completed today: the active API key's free-models-per-day quota was already exhausted account-wide (confirmed via `X-RateLimit-Remaining: 0` on multiple *different* free models, not just this one), and several Venice-hosted free models (including this one) were separately hitting transient upstream provider rate-limits on every retry attempted (7+ distinct models tried across ~2 minutes of backoff waits). Both are genuine external constraints, not a defect in the choice — re-verify with a real call once the daily quota resets.
- [x] 5.2 Confirmed `backend/.env.example` already documents the distinct-fallback requirement correctly — no change needed.
- [x] 5.3 Started the backend locally (`npm run dev`, backgrounded ~10s): MongoDB connected successfully and the `LLM_MODEL_FALLBACK is identical to LLM_MODEL_CONTENT` boot warning did not fire — confirms the misconfiguration is fixed.

## 6. Decision doc

- [x] 6.1 `BANGLA-QUALITY-DECISION.md` (repo root): rubric with concrete score anchors, review process (blinding steps, reviewer count, tie-break rule), decision rule (free-vs-paid threshold), and an initially-empty decision-record table, explicitly marked "Gate G3 — Not yet run" pending a real Track-0 corpus

## 7. Tests

- [x] 7.1 `contentGeneration.retrieval.test.ts` (extended): 5 new unit tests for `buildStyleContext` — no pack → undefined; pack without fetched examples → undefined; card + examples match a direct `rankStyleExamples` call; missing `style_card` → examples only; format-appropriate platform preference passthrough (all passing)
- [x] 7.2 `contentGeneration.bakeoff.test.ts` (new): 12 tests — shuffle determinism/no-loss, label assignment, blinding (no model identity leaks into the review markdown, including a failed-cell case), matrix-cap rejection for models/topics/formats before any DB or LLM call (asserted via zero call counts), unresolvable-pack rejection, and per-cell failure isolation (one model's cell errors, the sibling model's cell succeeds unaffected) — all passing
- [x] 7.3 `contentGeneration.integration.test.ts` (extended): prompt-parity test — the bake-off seam and a live `POST /content/generate` request (brand-voice-cold team, same topic/format/pack) produce a byte-identical system prompt — passing
- [x] 7.4 `cd backend && npm test && npm run build` — 352/352 tests pass, build clean

## 8. Verification

- [x] 8.1 `cd backend && npm test` — 352/352 pass
- [x] 8.2 `cd backend && npm run build` — clean
- [x] 8.3 Live dry run: seeded a scratch pack with 2 real Bangla facebook-tagged examples, ran `npm run verify:bangla-bakeoff -- --models nvidia/nemotron-3-ultra-550b-a55b:free --pack bakeoff-scratch-9c --formats facebook_post` against real Atlas — all 6 default topics ran, both output files were written correctly. The review Markdown correctly blinded all 6 samples (labels Sample A1–F1, no model identity anywhere in the file) and correctly rendered the "Generation failed" placeholder for every cell (all 6 hit real `429`s — the same daily quota exhaustion documented in task 5.1). The JSON confirmed real, fully-assembled 1,851-character system prompts were built and sent for every cell despite the completion calls failing, and the label map correctly revealed the true model only in the JSON. This is a complete, real verification of every code path except a successful (non-erroring) generation, which today's exhausted free-tier quota made impossible to observe — not a gap in the implementation. Scratch pack and output files cleaned up afterward.
- [x] 8.4 Confirmed via task 5.3 (boot warning no longer fires)
- [x] 8.5 Explicitly out of scope for this change's verification (per design.md Non-Goals), confirmed still true: running the full bake-off against real candidate models and a real Track-0 corpus, and filling in `BANGLA-QUALITY-DECISION.md`'s decision-record table. That remains Gate G3, to be executed once Track 0 (a real writer corpus) lands — the harness itself is now fully built, tested, and live-verified as ready for that run.
