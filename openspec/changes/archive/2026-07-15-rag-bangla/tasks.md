## 1. Brand Voice Seed File

- [x] 1.1 Create `backend/seed/brand-voice.example.json` with 5 sample Bangla-script posts (facebook/youtube, categories: AI, Web Dev, Career) matching the seed schema

## 2. GeneratedContent Module — Model & Interface

- [x] 2.1 Create `backend/src/app/modules/GeneratedContent/generatedContent.interface.ts` — define `IGeneratedContent` with fields: team_id, news_item_id?, topic, formats (facebook_post, facebook_reel_script, linkedin_post, youtube_idea, caption), source ('auto'|'manual'), status ('draft'|'approved'|'dismissed'), model_used, created_at
- [x] 2.2 Create `backend/src/app/modules/GeneratedContent/generatedContent.model.ts` — Mongoose schema with compound unique index on `(team_id, news_item_id)` and index on `(team_id, created_at)`

## 3. GeneratedContent Module — Validation

- [x] 3.1 Create `backend/src/app/modules/GeneratedContent/generatedContent.validation.ts` — Zod schemas for GET query (team_id required, status/source optional), PATCH body (status enum), POST /run body (team_id optional)

## 4. GeneratedContent Module — Auto-Generation Job

- [x] 4.1 Create `backend/src/app/modules/GeneratedContent/generatedContent.job.ts` — `runAutoGeneration(teamId?: string)` function that: iterates teams with ≥1 brand voice example, fetches top-3 news items by opportunity_score, skips already-drafted (team_id, news_item_id) pairs, calls `ContentGenerationService.generateContent()` with admin IRequestUser, saves drafts with `source: 'auto'`, enforces `AUTO_GENERATION_MAX_PER_RUN` cap, wraps each team in try/catch, returns `{ teams_processed, drafts_created, skipped }` summary

## 5. GeneratedContent Module — Service

- [x] 5.1 Create `backend/src/app/modules/GeneratedContent/generatedContent.service.ts` — `listDrafts(query, requestingUser)` with team access check, `updateStatus(id, status, requestingUser)` with team access check, `triggerRun(teamId?, requestingUser)` admin-only wrapper around `runAutoGeneration()`

## 6. GeneratedContent Module — Controller & Route

- [x] 6.1 Create `backend/src/app/modules/GeneratedContent/generatedContent.controller.ts` — controllers for GET /, POST /run, PATCH /:id using `catchAsync` pattern
- [x] 6.2 Create `backend/src/app/modules/GeneratedContent/generatedContent.route.ts` — register routes with auth middleware and validation; `POST /run` requires admin role

## 7. Wiring — Scheduler & Routes

- [x] 7.1 Add `AUTO_GENERATION_CRON` (default `0 6 * * *`) and `AUTO_GENERATION_MAX_PER_RUN` (default `10`) to `backend/src/app/config/index.ts`
- [x] 7.2 Add `startAutoGenerationScheduler()` to `backend/src/app/lib/scheduler.ts` following the `startAnalyticsScheduler()` pattern
- [x] 7.3 Call `startAutoGenerationScheduler()` in `backend/src/server.ts` alongside the existing scheduler starts
- [x] 7.4 Register `{ path: '/generated-content', route: GeneratedContentRoutes }` in `backend/src/app/routes/index.ts`

## 8. OpenAPI Documentation

- [x] 8.1 Create `backend/src/app/docs/generatedContentPaths.ts` — document `GET /generated-content`, `POST /generated-content/run`, `PATCH /generated-content/:id` following the `chatPaths.ts` pattern
- [x] 8.2 Register the new paths in `backend/src/app/docs/openapi.ts`

## 9. Verification

- [x] 9.1 Manual smoke test: seed a team, call `POST /generated-content/run`, verify drafts appear in `GET /generated-content?team_id=<id>&status=draft`
- [x] 9.2 Verify cold-start team (no brand voice examples) produces no drafts and logs skip
- [x] 9.3 Verify `PATCH /generated-content/:id` with `status: 'dismissed'` updates the document
- [x] 9.4 Verify `AUTO_GENERATION_MAX_PER_RUN=2` caps generation at 2 LLM calls across all teams
