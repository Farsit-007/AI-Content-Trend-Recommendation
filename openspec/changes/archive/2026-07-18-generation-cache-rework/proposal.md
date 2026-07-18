# Generation Cache Rework

## Why

Interactive content generation currently caches the *final creative output* in Redis for 24h per
team+item+language+pack+format — so pressing Generate a second time silently returns yesterday's
identical draft, which users read as "regeneration is broken" (reported 2026-07-18). The expensive,
deterministic work (fact extraction, embeddings, retrieval) is what deserves caching; the creative
draft is cheap to vary and is exactly what users expect to be fresh on every click.

## What Changes

- **BREAKING (behavioral):** `POST /content/generate` no longer serves format outputs from the Redis
  response cache — every interactive request produces a fresh LLM draft. The `regenerate` request
  flag becomes a no-op (kept accepted for API compatibility, ignored).
- Remove the per-format output cache write/read in `contentGeneration.service.ts` and the
  `CONTENT_CACHE_TTL_SECONDS` config (env + `.env.example`).
- Keep the fact-sheet cache (7-day Redis TTL in `contentGeneration.facts.ts`) — unchanged.
- Add a topic-embedding cache (Redis, keyed by sha256 of topic text, ~7-day TTL) so repeated
  generations of the same topic don't re-pay the embedding call.
- Auto-generation job: confirm and document that its idempotency comes from persisted
  `GeneratedContent` drafts (skip-if-already-drafted), not the response cache; add a regression test
  asserting the job does not double-draft the same team+item after the cache removal.
- Frontend: the per-card Regenerate button keeps working (it's just another fresh generate); remove
  the now-meaningless `regenerate: true` from `Generate.tsx` once the backend ignores it.

## Capabilities

### New Capabilities
- `content-generation-caching`: what may and may not be cached across the content generation
  pipeline — fresh-by-default creative output, cached intermediates (fact sheets, topic
  embeddings), and auto-generation idempotency guarantees.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- `backend/src/app/modules/ContentGeneration/contentGeneration.service.ts` (cache read/write
  removal, embedding cache), `contentGeneration.facts.ts` (unchanged, referenced),
  `backend/src/app/config/index.ts` + `.env.example` (drop `CONTENT_CACHE_TTL_SECONDS`).
- `backend/src/app/modules/GeneratedContent/generatedContent.job.ts` (verify/document idempotency).
- `backend/src/__tests__/contentGeneration.integration.test.ts` and
  `generatedContent.job.integration.test.ts` (cache-behavior tests rewritten).
- `frontend/src/pages/dashboard/Generate.tsx`, `frontend/src/lib/api/content.ts` (drop
  `regenerate`).
- Cost note: each Generate click now always spends one LLM call per requested format; acceptable at
  current volumes (interactive + ≤10 auto-drafts/day), and intermediates stay cached.
