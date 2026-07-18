## 1. Config

- [x] 1.1 `config/index.ts`: `CONTENT_FACTS_MIN_CHARS` (zod string, default `'800'`), `CONTENT_FACTS_INPUT_MAX_CHARS` (default `'12000'`) → new `config.content_generation.{facts_min_chars, facts_input_max_chars}` namespace

## 2. News item context widening

- [x] 2.1 `contentGeneration.interface.ts`: `NewsItemContext` gains `content?: string`, `content_status?: string`
- [x] 2.2 `contentGeneration.service.ts` `resolveNewsItemContext`: also return `content`/`content_status` from the resolved `NewsItem`

## 3. Fact extraction

New `backend/src/app/modules/ContentGeneration/contentGeneration.facts.ts`.

- [x] 3.1 `extractFactSheet(title: string, content: string): Promise<{ summary: string; facts: string[] } | null>` — one `chatCompletion({ model: LLM_MODELS.standard, temperature: 0.2, messages })` call with content capped at `config.content_generation.facts_input_max_chars`; strict-JSON parse mirroring `categorizeOneBatch`'s discipline (fence-strip, `JSON.parse`, shape validation: `summary` non-empty string ≤3 sentences worth, `facts` array of 5-10 non-empty strings each ≤200 chars); returns `null` on any parse/shape failure; the system prompt is an exported const for unit testing
- [x] 3.2 `getOrExtractFactSheet(newsItemId: string, title: string, content: string): Promise<{ summary: string; facts: string[] } | null>` — Redis wrapper: `redis.get('facts:' + newsItemId)` → parse and return if present; else call `extractFactSheet`, and on a non-null result `redis.setex('facts:' + newsItemId, 604800, JSON.stringify(result))`; on `null`, cache nothing (so a later request can retry) and `logger.warn`

## 4. Service wiring

- [x] 4.1 `contentGeneration.service.ts`: in `generateContent`, after `resolveNewsItemContext` resolves (inside the existing `misses.length > 0` branch, alongside the existing retrieval calls), when `newsContext?.content` exists and its length ≥ `config.content_generation.facts_min_chars` and `payload.news_item_id` is present, call `getOrExtractFactSheet(payload.news_item_id, payload.topic, newsContext.content)`; thread the resulting fact sheet (or `undefined`) into every miss format's `buildMessages(...)` call

## 5. Prompt

- [x] 5.1 `contentGeneration.prompt.ts`: `buildUserPrompt(topic, newsContext?, factSheet?)` renders the "Key facts from the source" block after the existing context line per §Design-5; `buildMessages` gains and threads a `factSheet` parameter through to `buildUserPrompt`; `GROUNDING_INSTRUCTION` wording extended to mention the provided fact list

## 6. Tests

- [x] 6.1 `contentGeneration.facts.test.ts` (new, mock `chatCompletion`): valid JSON → parsed; fenced JSON (```json ... ```) → parsed; wrong shape (missing `facts`, non-array `facts`, empty `summary`) → `null`; input longer than `CONTENT_FACTS_INPUT_MAX_CHARS` is capped before being sent to the model
- [x] 6.2 Integration (`contentGeneration.integration.test.ts`): content-rich item (mock content ≥ threshold) → one extraction call precedes format calls, facts appear in every requested format's user prompt (sequence mock: facts JSON, then format text responses); a second team generating from the same item within the TTL → no new extraction call (assert call count)
- [x] 6.3 Integration: short-content item → no extraction call, prompt shape unchanged from pre-change; extraction call returning garbage → 200 response, facts block absent, warning logged, generation otherwise unaffected
- [x] 6.4 Prompt unit test (`contentGeneration.prompt.test.ts`): `buildUserPrompt` with a `factSheet` renders the exact block format (facts list + summary line) after the existing context line; omitted `factSheet` renders identically to pre-change output

## 7. Verification

- [x] 7.1 `cd backend && npm test && npm run build`
