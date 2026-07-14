## Context

Phase 1 of the plan (seed script, voice profile, language instructions in prompts, per-request language override) is already fully implemented in the backend. All the personalization plumbing is live: `resolveVoiceOptions()` reads `team.voice_profile.default_language` and applies a per-request override, both `contentGeneration.prompt.ts` and `chat.prompt.ts` emit explicit Bangla/Banglish/English instructions, and `seedBrandVoice.ts` can load real posts. The only backend work remaining is **Phase 2: the `GeneratedContent` module** — persisting generated drafts and running nightly auto-generation per team.

## Goals / Non-Goals

**Goals:**
- New `GeneratedContent` module (model, interface, service, controller, route, validation) following the standard pattern established by `Analytics`, `Report`, `Chat`, etc.
- Auto-generation job (`generatedContent.job.ts`) that runs daily: for each team with ≥1 brand voice example, picks top-opportunity news items not yet drafted for that team, calls the existing `ContentGenerationService.generateContent()`, and saves results as `status: 'draft'`.
- Quota guard — `AUTO_GENERATION_MAX_PER_RUN` env var (default 10 total LLM calls per run) protects the OpenRouter free tier.
- Cron registration in `lib/scheduler.ts` following `startAnalyticsScheduler()` pattern; configurable via `AUTO_GENERATION_CRON` env var (default `0 6 * * *`).
- Three endpoints: `GET /generated-content` (list drafts, team-scoped), `POST /generated-content/run` (admin manual trigger), `PATCH /generated-content/:id` (approve/dismiss).
- Route and OpenAPI doc registration.
- `seed/brand-voice.example.json` — a reference JSON file teams copy and fill with their own real posts.

**Non-Goals:**
- Frontend UI (explicitly out of scope for this change).
- Phase 3 items: approve-loop back into brand_voice_examples, unified `lib/rag/` extraction, Atlas `$vectorSearch`.
- Paying for a different embedding or LLM model — stays 100% on OpenRouter free tier.

## Decisions

### D1: Reuse `ContentGenerationService.generateContent()` directly in the job

**Decision:** The auto-gen job calls `ContentGenerationService.generateContent()` with a synthetic `IRequestUser` (admin role) rather than duplicating retrieval + prompt + LLM logic.

**Rationale:** Keeps the generation path single-source-of-truth. Any improvements to the voice RAG, prompt, or Redis cache benefit auto-gen automatically. The service already handles cold-start detection, few-shot retrieval, and Redis caching.

**Alternative considered:** A dedicated `autoGenerateForNewsItem(teamId, newsItem)` function. Rejected — would duplicate ~60 lines of service code.

### D2: Opportunity ordering falls back to global `opportunity_score` until Report module is proven

**Decision:** The job sorts news items by `opportunity_score` descending (MongoDB sort) rather than calling `computeAudienceMatch()` per team.

**Rationale:** `computeAudienceMatch()` requires loading all of a team's `platform_posts` embeddings (N × teams DB reads before generating). At demo scale this is fine, but the simpler global score is already a meaningful signal and avoids the N+1 pattern on first run. The comment in the plan explicitly says "until then, global `opportunity_score`".

**How to upgrade:** Add a `USE_AUDIENCE_MATCH=true` env flag that activates the per-team path when teams have platform data — one-line conditional in the job.

### D3: Per-team try/catch — one team's failure never blocks others

**Decision:** The job wraps each team in an independent try/catch and logs failures without throwing.

**Rationale:** Matches the existing pattern in `runAnalyticsRefresh()`. A bad team credential or empty brand voice causing a throw should not abort the rest of the run.

### D4: Dedup on `(team_id, news_item_id)` compound unique index

**Decision:** Before generating, query `GeneratedContent.exists({ team_id, news_item_id })`. Also enforce a MongoDB unique index on that pair so concurrent runs can't race.

**Rationale:** The job may run daily; the same trending news item should not accumulate duplicate drafts. The index makes the dedup check O(1) and crash-safe.

### D5: `source` field distinguishes auto from manual

**Decision:** `source: 'auto' | 'manual'` on the model. Manual `POST /content/generate` calls eventually saved here carry `source: 'manual'`; the job writes `source: 'auto'`.

**Rationale:** The UI (when built) can sort or filter by source, and the demo story distinguishes "AI auto-drafted this for you" from "you requested this".

## Risks / Trade-offs

- **OpenRouter quota burn** → Mitigation: `AUTO_GENERATION_MAX_PER_RUN` defaults to 10; operators increase it after confirming their quota. Redis cache means re-generating the same topic for the same team is free.
- **Cold-start teams get nothing** → By design. Auto-gen skips teams with zero brand voice examples to avoid generic content. The fix is to run `seed:brand-voice` first.
- **Stale drafts accumulate** → Mitigation: `GET /generated-content` supports `?status=draft` filter; the `PATCH /:id` dismiss path removes clutter. A TTL index on `created_at` (e.g., 30 days) can be added post-demo.
- **No rollback for generated text** → Generated content is text, not a schema migration. Dismiss the draft. No data loss risk.

## Open Questions

- Should `PATCH /generated-content/:id` with `status: 'approved'` also write the content back into `brand_voice_examples` (Phase 3 self-improving loop)? Decision: **no for this change** — keep it a one-liner to add later.
- Should the job also accept an explicit `news_item_id` list via `POST /generated-content/run` body? Decision: **no** — admin can call `POST /content/generate` directly for one-off items.
