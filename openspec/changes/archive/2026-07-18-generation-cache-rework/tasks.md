# Tasks — Generation Cache Rework

## 1. Backend: remove the response cache

- [x] 1.1 In `contentGeneration.service.ts`, delete `buildCacheKey`, the cache read
      (`cachedEntries`), the cache write (`redis.setex` block), and treat every requested format as
      a miss; keep the `regenerate` field accepted-but-ignored in the flow.
- [x] 1.2 Remove `CONTENT_CACHE_TTL_SECONDS` from `config/index.ts`, `.env`, `.env.example`,
      `.env.test`, and the OpenAPI docs (`app/docs/*`) if referenced. (Not present in `.env.test` to
      begin with — nothing to remove there.)
- [x] 1.3 Ensure `model_used` is now always present in the response (no cache-hit path can skip
      model resolution) and reflect that in `docs/schemas.ts` if it was documented as optional.
      (Added to the schema's `required` array; frontend `GenerateContentResponse.model_used` is now
      non-optional too.)

## 2. Backend: topic-embedding cache

- [x] 2.1 Add a small helper (e.g. in `contentGeneration.retrieval.ts` or a new
      `contentGeneration.embedCache.ts`): `getOrEmbedTopic(topic, teamId)` → Redis key
      `embed:topic:{sha256(topic)}:{resolvedEmbeddingModelId}`, TTL 7 days, JSON vector value.
- [x] 2.2 Use it in `generateContent` for the no-news-item path only.
- [x] 2.3 Unit-test: second call within TTL does not hit the embedding provider; changing the
      resolved model id causes a fresh embed. (`contentGeneration.embedCache.test.ts`, 2/2 passing.)

## 3. Backend: auto-generation idempotency test

- [x] 3.1 In `generatedContent.job.integration.test.ts`, add a run-twice test: second run creates 0
      drafts and 0 chat-completion calls (assert via the OpenRouter mock call count).

## 4. Tests: rewrite cache-behavior assertions

- [x] 4.1 Update `contentGeneration.integration.test.ts`: replace cache-hit/cache-bypass tests with
      fresh-generation assertions (two identical requests → two sets of LLM calls) and the
      regenerate-flag-ignored scenario. Also fixed a real cross-test Redis-cache-key collision risk
      the new topic-embedding cache introduced (two pre-existing tests reused the identical literal
      topic string without a news_item_id; renamed one to a unique string so it isn't a false
      cache-hit against the other, verified by re-running the file before/after).
- [x] 4.2 Run the full backend suite; everything green. 518/519 passing (1 pre-existing, unrelated
      flaky test in `newsDedupLedger.integration.test.ts` — see status report).

## 5. Frontend

- [x] 5.1 Remove `regenerate: true` from `Generate.tsx`'s regenerate mutation and the field from
      `lib/api/content.ts`'s `GenerateContentRequest` (backend still tolerates it).
- [ ] 5.2 Manual check: Generate twice on the same item → different drafts; per-card Regenerate
      still works; `npm run build` clean. **`npm run build` confirmed clean**; the manual
      browser check (running dev server, clicking Generate twice) was not performed in this pass.

## 6. Cleanup

- [ ] 6.1 Optionally flush stale keys: `redis-cli --scan --pattern 'content:*'` → delete (or let
      them expire within 24h). **Not run** — optional, no-op if skipped (keys expire naturally);
      requires access to the live Redis instance, not attempted in this pass.
- [x] 6.2 Update `VISION-ALIGNMENT-VERIFIED-STATUS-2026-07-18.md` §4.3 status once shipped.
