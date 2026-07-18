## 1. Extract shared prompt-assembly seam (behavior-preserving refactor)

- [ ] 1.1 `contentGeneration.retrieval.ts`: add `export const buildStyleContext = (format, stylePack, stylePackExamples, topicEmbedding): StyleContext | undefined` per design.md decision 1
- [ ] 1.2 `contentGeneration.service.ts`: replace the inline per-format `styleContext` ternary in `generateContent`'s miss loop with a call to `buildStyleContext(format, stylePack, stylePackExamples, topicEmbedding)` — no other behavior change
- [ ] 1.3 Export `resolveNewsItemContext` from `contentGeneration.service.ts` (or relocate to `contentGeneration.retrieval.ts` if that keeps the import graph cleaner) so the harness can reuse it unchanged
- [ ] 1.4 Run the full existing `contentGeneration.*` test suite and confirm zero changes required to existing test expectations (proves the refactor is behavior-preserving)

## 2. Bake-off matrix module

- [ ] 2.1 `contentGeneration.bakeoff.ts`: `shuffleWithSeed<T>(items: T[], seed: number): T[]` — deterministic inline PRNG (mulberry32-style), no new dependency
- [ ] 2.2 `contentGeneration.bakeoff.ts`: types `BakeoffTopic { topic: string; news_item_id?: string; category_hint?: string }`, `BakeoffCell { model: string; topic: string; format: FormatId; systemPrompt: string; userPrompt: string; output?: string; error?: string; latency_ms: number }`, `BakeoffRun { seed: number; startedAt: string; packSlug: string; cells: BakeoffCell[] }`
- [ ] 2.3 `contentGeneration.bakeoff.ts`: `runBakeoffMatrix({ models, topics, formats, packSlug, language })` — validates matrix caps (≤4 models, ≤8 topics, ≤2 formats) before any call; resolves the pack once (`StylePack.findOne({ slug: packSlug, is_active: true })`), fetches its examples once (`fetchStylePackExamples`); per topic, resolves news-item context via the reused `resolveNewsItemContext` (task 1.3) if `news_item_id` given, else embeds the topic text via `embed()`; per `(model, topic, format)` cell (serial, small fixed delay between calls), builds `styleContext` via `buildStyleContext`, `messages` via `buildMessages` (fewShotExamples always `[]` per design.md decision 3), calls `chatCompletion({ model, messages, temperature: 0.7 })` inside a try/catch that records `{ error }` on failure without throwing
- [ ] 2.4 `contentGeneration.bakeoff.ts`: `formatReviewMarkdown(run, shuffledIndices)` — pure formatter producing the blinded review doc: one section per shuffled sample labeled `Sample <Letter><n>` (no model identity), rubric table (Bangla correctness /5, style fidelity /5, AI-tell absence /5, factual grounding /5, "publish with ≤2 edits? yes/no")
- [ ] 2.5 `contentGeneration.bakeoff.ts`: `buildLabelMap(run, shuffledIndices)` — maps each label back to its full `BakeoffCell` for the JSON output

## 3. CLI script

- [ ] 3.1 `scripts/banglaBakeoff.ts`: arg parsing (`--models <id,id,...>`, `--pack <slug>`, `--topics-file <path>`, defaulting to `seed/bakeoff-topics.json`, `--formats <id,id>` defaulting to `facebook_post,linkedin_post`, `--language`, optional `--seed`); `dns.setServers`/`mongoose.connect` boilerplate (established convention)
- [ ] 3.2 `scripts/banglaBakeoff.ts`: call `runBakeoffMatrix`, then `formatReviewMarkdown`/`buildLabelMap`, write `backend/bakeoff-results/bakeoff-<timestamp>.json` and `bakeoff-<timestamp>-review.md`, print a one-line summary (cells run, cells errored, output paths), disconnect
- [ ] 3.3 Register `verify:bangla-bakeoff` npm script in `backend/package.json`
- [ ] 3.4 `backend/.gitignore`: add `bakeoff-results/`

## 4. Default topic set

- [ ] 4.1 `backend/seed/bakeoff-topics.json`: 6 topics per design.md decision 6 (2 AI, 1 Web Dev, 1 Career, 1 Security, 1 DevOps), `news_item_id` absent, `category_hint` present for human readability

## 5. Env fix

- [ ] 5.1 `backend/.env`: set `LLM_MODEL_FALLBACK` to a distinct, currently-free OpenRouter model (live-verify it actually responds before committing to it — the free catalog changes over time, matching this file's own existing practice)
- [ ] 5.2 Confirm `backend/.env.example` already documents the distinct-fallback requirement correctly (expected: no change needed — verify only)
- [ ] 5.3 Start the backend locally and confirm the `LLM_MODEL_FALLBACK is identical to LLM_MODEL_CONTENT` boot warning no longer fires

## 6. Decision doc

- [ ] 6.1 `docs/BANGLA-QUALITY-DECISION.md` (repo root): rubric with concrete score anchors, review process (reviewer count, tie-break rule), and an initially-empty decision-record table (date, chosen model, score summary, free-vs-paid call) to be appended once Gate G3 actually runs

## 7. Tests

- [ ] 7.1 `contentGeneration.retrieval.test.ts` (extend): unit tests for `buildStyleContext` — no pack → `undefined`; pack with examples → card + ranked examples matching a direct `rankStyleExamples` call with the same inputs; pack with no `style_card` → examples only, `card: undefined`
- [ ] 7.2 `contentGeneration.bakeoff.test.ts` (new): `shuffleWithSeed` determinism (same seed → same order, different seed → different order with high probability); `formatReviewMarkdown` output contains no model-identifying text for any sample; matrix-cap validation rejects >4 models / >8 topics / >2 formats before any mocked `chatCompletion` call occurs; a mocked per-cell failure is captured in the run's cells without throwing and without affecting other cells
- [ ] 7.3 `contentGeneration.integration.test.ts` (extend) or a new focused test: prompt-parity — build a prompt via the bake-off seam (`buildStyleContext` + `buildMessages`, fewShotExamples `[]`) for a topic/format/pack, and via a live `POST /content/generate` request for a team with zero brand-voice examples using the same topic/format/pack; assert the two system prompts are identical
- [ ] 7.4 `cd backend && npm test && npm run build`

## 8. Verification

- [ ] 8.1 `cd backend && npm test`
- [ ] 8.2 `cd backend && npm run build`
- [ ] 8.3 Live dry run: `npm run verify:bangla-bakeoff -- --models <the-current-free-model> --pack <a-scratch-pack-with-examples> --formats facebook_post` (1×N×1 cells) against real Atlas/OpenRouter — confirm both output files are written, the JSON contains real prompts/output, and the review Markdown reveals no model identity
- [ ] 8.4 Confirm task 5.3's live boot-warning check
- [ ] 8.5 Explicitly out of scope for this change's verification (per design.md Non-Goals): running the full bake-off against real candidate models and a real Track-0 corpus, and filling in `docs/BANGLA-QUALITY-DECISION.md`'s decision-record table — that is Gate G3, executed once Track 0 lands
