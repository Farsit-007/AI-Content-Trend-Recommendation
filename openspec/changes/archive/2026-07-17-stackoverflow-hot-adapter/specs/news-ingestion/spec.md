## ADDED Requirements

### Requirement: Stack Overflow Hot-Questions Source
The pipeline SHALL include a `stackoverflow` adapter that fetches the Stack
Exchange hot-questions listing for the stackoverflow site once per run,
normalizing each question with an entity-decoded title, its tag list as the
snippet, its creation date as `published_at`, and `score`/`answer_count` as the
engagement signals. The adapter SHALL function without `STACKEXCHANGE_KEY` and
SHALL send the key when configured. An API-level error response SHALL be
treated as an adapter failure.

#### Scenario: Hot questions normalized
- **WHEN** the adapter fetches a question with `score: 18`, `answer_count: 4`, and title `"Why doesn&#39;t useEffect fire?"`
- **THEN** the emitted item has `source: "stackoverflow"`, `raw_points: 18`, `raw_comments: 4`, and title `Why doesn't useEffect fire?`

#### Scenario: Keyless operation
- **WHEN** `STACKEXCHANGE_KEY` is unset
- **THEN** the request is made without a key parameter and the adapter functions normally

#### Scenario: API error response
- **WHEN** the API returns an error body (`error_id`/`error_message`)
- **THEN** the adapter throws with that message and the run history records it
