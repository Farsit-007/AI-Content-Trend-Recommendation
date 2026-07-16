## ADDED Requirements

### Requirement: Lobsters Source
The pipeline SHALL include a `lobsters` adapter that fetches the Lobsters hottest
stories JSON endpoint once per run and normalizes each story with its community
engagement signals (`score` as points, `comment_count` as comments), its real
submission timestamp as `published_at`, and — for text posts without an external
URL — the story's comments page as the item URL.

#### Scenario: Hottest stories are normalized with engagement
- **WHEN** the adapter fetches `https://lobste.rs/hottest.json` and receives a story with `score: 42` and `comment_count: 7`
- **THEN** the emitted item has `source: "lobsters"`, `raw_points: 42`, `raw_comments: 7`, and `published_at` equal to the story's `created_at`

#### Scenario: Text post without external URL
- **WHEN** a fetched story has an empty `url` field
- **THEN** the emitted item's `url` is the story's `comments_url`

#### Scenario: Endpoint failure is visible
- **WHEN** the hottest endpoint returns a non-OK status
- **THEN** the adapter throws, and the run history records the error for source `lobsters`
