## ADDED Requirements

### Requirement: GeneratedContent module stores drafts
The system SHALL provide a `generated_content` MongoDB collection with fields: `team_id`, `news_item_id` (optional), `topic`, `formats` (facebook_post, facebook_reel_script, linkedin_post, youtube_idea, caption), `source` ('auto' | 'manual'), `status` ('draft' | 'approved' | 'dismissed'), `model_used`, `created_at`. A compound unique index on `(team_id, news_item_id)` SHALL prevent duplicate drafts for the same team+news item pair.

#### Scenario: Draft created by auto-generation job
- **WHEN** the auto-generation job runs for a team and generates content for a news item
- **THEN** a `GeneratedContent` document is saved with `source: 'auto'` and `status: 'draft'`

#### Scenario: Duplicate draft prevented
- **WHEN** the job attempts to generate content for a `(team_id, news_item_id)` pair that already has a draft
- **THEN** the item is skipped and no duplicate document is created

### Requirement: List drafts endpoint
`GET /generated-content` SHALL return a paginated list of generated content documents filtered by `team_id` (required). Optional filters: `status` ('draft' | 'approved' | 'dismissed'), `source` ('auto' | 'manual'). Only team members and admins MAY access a team's drafts.

#### Scenario: Team member retrieves drafts
- **WHEN** a team member calls `GET /generated-content?team_id=<id>&status=draft`
- **THEN** only draft documents for that team are returned

#### Scenario: Non-member is rejected
- **WHEN** a user not in the team calls `GET /generated-content?team_id=<id>`
- **THEN** the response is 403 Forbidden

### Requirement: Admin manual trigger endpoint
`POST /generated-content/run` SHALL trigger the auto-generation job immediately for all teams (or a specific `team_id` in the request body). Only admin and super_admin roles MAY call this endpoint.

#### Scenario: Admin triggers run
- **WHEN** an admin posts to `/generated-content/run`
- **THEN** the job runs synchronously, drafts are created for eligible teams, and the response includes a summary (teams_processed, drafts_created, skipped)

#### Scenario: Non-admin is rejected
- **WHEN** a regular user calls `POST /generated-content/run`
- **THEN** the response is 403 Forbidden

### Requirement: Approve or dismiss a draft
`PATCH /generated-content/:id` SHALL accept `{ status: 'approved' | 'dismissed' }`. Only team members and admins MAY update a draft belonging to their team.

#### Scenario: Team member dismisses a draft
- **WHEN** a team member patches a draft to `status: 'dismissed'`
- **THEN** the document status is updated and the response reflects the new status

#### Scenario: Invalid status transition
- **WHEN** a request tries to set status to an unknown value
- **THEN** the response is 400 Bad Request

### Requirement: Auto-generation job selects top-opportunity items per team
The job SHALL: (1) iterate all teams that have ≥1 `brand_voice_example`; (2) for each team, fetch the top-N news items by `opportunity_score` descending (N defaults to 3); (3) skip items already drafted for that team; (4) call `ContentGenerationService.generateContent()` for remaining items; (5) respect a global cap of `AUTO_GENERATION_MAX_PER_RUN` LLM calls per job run (default 10); (6) wrap each team in try/catch so one failure does not abort the rest.

#### Scenario: Team with brand voice examples gets drafts
- **WHEN** a team has ≥1 brand voice example and 3 undrafted top-opportunity news items
- **THEN** 3 drafts are created for that team

#### Scenario: Cold-start team is skipped
- **WHEN** a team has zero brand voice examples
- **THEN** no drafts are created for that team and the job logs the skip

#### Scenario: Quota cap stops generation mid-run
- **WHEN** `AUTO_GENERATION_MAX_PER_RUN` is 5 and there are 10 items to generate across teams
- **THEN** exactly 5 drafts are created and the job stops without error

### Requirement: Auto-generation runs on daily cron
The system SHALL schedule the auto-generation job daily via `lib/scheduler.ts` using the `AUTO_GENERATION_CRON` env var (default `0 6 * * *`). A failed cron run SHALL log the error and not crash the API server.

#### Scenario: Cron fires and job runs
- **WHEN** the cron schedule fires
- **THEN** the auto-generation job executes and logs a summary of the run

#### Scenario: Job failure is contained
- **WHEN** the job throws an unhandled error
- **THEN** the error is logged and the server continues running normally
