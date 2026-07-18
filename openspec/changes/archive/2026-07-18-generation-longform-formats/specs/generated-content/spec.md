## MODIFIED Requirements

### Requirement: GeneratedContent module stores drafts
The system SHALL provide a `generated_content` MongoDB collection with fields: `team_id`, `news_item_id` (optional), `topic`, `formats` (an object holding any non-empty subset of `facebook_post`, `facebook_reel_script`, `linkedin_post`, `youtube_idea`, `caption` — every individual field is optional, but at least one SHALL be populated on every write), `source` ('auto' | 'manual'), `status` ('draft' | 'approved' | 'dismissed'), `model_used`, `created_at`. A compound unique index on `(team_id, news_item_id)` SHALL prevent duplicate drafts for the same team+news item pair.

#### Scenario: Draft created by auto-generation job
- **WHEN** the auto-generation job runs for a team and generates content for a news item
- **THEN** a `GeneratedContent` document is saved with `source: 'auto'`, `status: 'draft'`, and `formats` containing the default pair (`facebook_post`, `linkedin_post`)

#### Scenario: Duplicate draft prevented
- **WHEN** the job attempts to generate content for a `(team_id, news_item_id)` pair that already has a draft
- **THEN** the item is skipped and no duplicate document is created

#### Scenario: Partial formats accepted
- **WHEN** a `GeneratedContent` document is created with only `facebook_post` and `linkedin_post` populated (the other three format fields absent)
- **THEN** the document validates and saves successfully

#### Scenario: Fully empty formats rejected
- **WHEN** a write attempts to create a `GeneratedContent` document whose `formats` object has no populated fields
- **THEN** the write is rejected before persisting
