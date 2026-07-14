## Context

The Generate page (`frontend/components/generate/ContentGenerator.tsx`) is fully built against a mock shape (`GeneratedContent` in `frontend/lib/mock/content.ts`) but has no real backend behind it. Two pieces of real infrastructure already exist and are unused for generation:

- `BrandVoiceExample` (`backend/src/app/modules/BrandVoiceExample/`) — team-scoped, curated voice examples with 1536-dim embeddings (`text-embedding-3-small`).
- `PlatformPost` (`backend/src/app/modules/PlatformPost/`) — team-scoped, synced published posts with embeddings and real engagement `metrics` (reach/likes/comments/shares/views).
- `LLM_MODELS.content` (`backend/src/app/lib/llmClient.ts`) is already reserved for "content generation... stronger creative writing", currently unused by any module.
- Atlas vector search indexes already exist for both collections (`brand_voice_vector_index`, `platform_posts_vector_index`) via `backend/src/scripts/createVectorIndexes.ts`, but the one existing RAG-like consumer (`NewsIngestion/newsIngestion.scoring.ts`'s `fetchBrandVoicePool`) doesn't use them — it brute-force cosine-similarities an entire pool in application code, because that pool is small (a handful of examples, not millions).

This change follows that same brute-force-in-app precedent rather than introducing `$vectorSearch` aggregations, since retrieval here is scoped to a single team's documents (expected to be tens to low-hundreds, not a corpus needing an ANN index).

## Goals / Non-Goals

**Goals:**
- Real `POST /content/generate` endpoint producing the exact `GeneratedContent` shape the frontend already renders.
- Retrieval grounded in the *requesting team's own* voice (BrandVoiceExample) and track record (PlatformPost) — never another team's, even as inspiration.
- Graceful cold start: a brand-new team with no BrandVoiceExample entries still gets content, just without few-shot grounding.
- Reuse of existing infra (`embed`, `chatCompletion`, `LLM_MODELS.content`) with no new dependencies.

**Non-Goals:**
- Not building `$vectorSearch` Atlas aggregation pipelines — deferred until a team's example pool is large enough that brute-force cosine similarity becomes a real bottleneck (see Risks).
- Not persisting generated content as a new collection/history — this is a stateless generate-and-return endpoint. (A "save this generation" feature, if wanted later, is a separate change.)
- Not changing `BrandVoiceExample` or `PlatformPost` schemas.
- Not building per-format streaming; the endpoint returns the complete JSON once generation finishes.

## Decisions

**1. Shared cosine similarity util, moved out of `NewsIngestion`.**
`cosineSimilarity` currently lives in `backend/src/app/modules/NewsIngestion/newsIngestion.utils.ts` — a module-private location that made sense when it had one caller. This change adds a second, unrelated caller, so `cosineSimilarity` moves to `backend/src/app/lib/similarity.ts`; `NewsIngestion` imports it from there instead of defining it. No behavior change to `NewsIngestion`.

**2. Team-scoped retrieval, brute-force in application code (not `$vectorSearch`).**
For a given `team_id`, fetch that team's `BrandVoiceExample` docs and `PlatformPost` docs (projection: `embedding` + display fields only), compute cosine similarity against the topic embedding in JS, and rank. This mirrors `newsIngestion.scoring.ts`'s existing pattern and avoids introducing a second retrieval mechanism (Atlas aggregation) for what is, per-team, a small pool. If a team's combined pool ever grows large enough for this to matter, that's a follow-up change to swap in `$vectorSearch` — the retrieval function's signature (`teamId, topicEmbedding -> examples`) stays the same either way, so the swap is internal.

**3. Cold start: zero `BrandVoiceExample` entries ⇒ skip all few-shot retrieval, not just the empty source.**
If `BrandVoiceExample.countDocuments({ team_id })` is 0, skip both `BrandVoiceExample` *and* `PlatformPost` retrieval and generate with a generic, brand-neutral system prompt. Rationale (confirmed with user): a team with no submitted voice examples has given no signal about tone, and mixing in raw `PlatformPost` snippets alone (metrics but no curated tone signal) risks the LLM latching onto stylistic noise rather than intentional voice. This is a deliberate contrast with `NewsIngestion`'s pooled-fallback behavior (`[[project-news-ingestion-pipeline]]`) — that pipeline pools *other* teams' examples because its output (relevance score) is anonymous and directional; this endpoint's output is team-published content, where borrowing another team's voice would be a correctness bug, not just a lower-quality heuristic.

**4. `PlatformPost` "top performer" pre-filter before similarity ranking.**
Engagement score = `reach + likes*2 + comments*3 + shares*4` (comments/shares weighted higher than passive reach/likes, consistent with the log-scale intuition in `newsIngestion.scoring.ts`'s `scoreTrend`, though this is a linear ranking score, not a 0-10 display score — it's only used to pick the candidate set, never shown to the user). Take the team's top 20 posts by this score, *then* rank those 20 by cosine similarity to the topic embedding, and keep the top 3. This two-stage filter (performance, then relevance) ensures few-shot examples are both proven and on-topic, rather than just topically similar regardless of whether they ever performed well.

**5. Few-shot budget: up to 3 `BrandVoiceExample` + up to 3 `PlatformPost`, each independently thresholded.**
Retrieve top-3 by similarity from each source (skip a source entirely if its team pool is empty, independent of the cold-start rule in Decision 3 which is specifically about *zero BrandVoiceExample*). No numeric similarity floor is enforced beyond "pool is non-empty" — with a small per-team pool, the top-3-by-similarity items are the best available signal even if similarity is moderate; an artificial floor would just reintroduce cold-start-like behavior inconsistently.

**6. Optional `news_item_id`: reuse embedding, fold in category/impact_note, don't require it.**
When present, `NewsItem.findById(news_item_id)` supplies the embedding for retrieval (skipping one `embed()` call) and its `category`/`impact_note` are appended to the LLM prompt as extra context ("this is trending because..."). The `topic` string is still required in the request and is what's shown back in the response's `topic` field and used for embedding if `news_item_id` is absent or not found — a missing/invalid `news_item_id` is a soft-fail (log + proceed as if it weren't provided), not a request error, since the topic text alone is always sufficient to generate.

**7. Single structured-JSON LLM call, following the `NewsIngestion.categorize` parse/fallback pattern.**
One `chatCompletion({ model: LLM_MODELS.content })` call per request, system prompt instructing strict JSON matching the `GeneratedContent` shape (minus `topic`, which the backend fills in from the request rather than trusting the LLM to echo it back). Response is parsed with the same "strip code fences, `JSON.parse`, validate required keys" approach as `newsIngestion.categorize.ts`. On parse failure or missing keys: return HTTP 502 with a clear error — unlike news categorization (which has a safe `category: 'Other'` fallback because the pipeline must keep moving for batch ingestion), there's no reasonable partial-content fallback for a single user-initiated generate request; the frontend already has a loading state, so surfacing a "generation failed, try again" error is the correct behavior, not silent degradation.

**8. Auth: standard team-scoping, not admin-only.**
`POST /content/generate` requires auth and validates `req.user.team_ids.includes(team_id)` unless `role === 'admin'`, matching `assertTeamAccess` in `brandVoiceExample.service.ts`. Any team member can generate content for their own team(s).

## Risks / Trade-offs

- **[Risk]** Brute-force cosine similarity over a team's full `BrandVoiceExample` + `PlatformPost` pool on every request → linear cost per generate call. **Mitigation**: per-team pools are expected to stay small (curated examples + a capped top-20 performer prefilter); if a team's pool grows large, swap the retrieval function's internals to `$vectorSearch` (indexes already exist) without changing its external contract.
- **[Risk]** LLM returns malformed JSON or omits a format. **Mitigation**: strict parse + key validation (Decision 7); fail loudly (502) rather than silently returning partial/wrong content, since this is an interactive request with a visible loading state, not a background batch job.
- **[Risk]** A team with a few low-quality or off-brand `BrandVoiceExample` entries could actively drag generation toward bad examples (unlike cold-start with zero examples, this isn't detectable automatically). **Mitigation**: none in this change — curation quality is a `BrandVoiceExample` CRUD/data-hygiene concern, out of scope here. Noted as an open question below.
- **[Trade-off]** Single combined LLM call (Decision 7) is cheaper/faster than 5 separate calls but couples all formats' success to one response; a malformed response fails the whole request rather than just one format. Accepted per user's explicit preference for cost/latency over per-format isolation.

## Open Questions

- Should low-quality/off-brand `BrandVoiceExample` entries be excluded from retrieval via some quality signal (e.g. an admin-set flag), or is submission-time curation (only add good examples) sufficient? Deferred — no signal exists today to distinguish "good" from "bad" examples beyond their existence.
- Should generated content ever be persisted (e.g. a "history" tab, or feeding accepted generations back as future `BrandVoiceExample` candidates)? Explicitly out of scope per Non-Goals; flagged here in case a future change wants to close that loop.
