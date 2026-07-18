## ADDED Requirements

### Requirement: Global per-task default model
The system SHALL allow a super_admin to set and read a global default `LlmModel` for each of the 8 defined
tasks (`content_generation`, `chat`, `categorization`, `dedup_adjudication`, `style_card`, `critique`,
`fact_extraction`, `embedding`).

#### Scenario: Set a global default for a task
- **WHEN** a super_admin calls `PUT /llm-providers/task-defaults/:task` with a valid `llm_model_id`
- **THEN** the system SHALL store or update that task's default, replacing any prior default for the same task

#### Scenario: List all configured global defaults
- **WHEN** a super_admin calls `GET /llm-providers/task-defaults`
- **THEN** the system SHALL return every currently-configured task default

### Requirement: Batch embeddings across every provider adapter
Every `LlmProviderAdapter` implementation SHALL support `embedBatch`, embedding multiple texts in one
underlying request where the provider's API supports it.

#### Scenario: OpenRouter/OpenAI batch embedding
- **WHEN** `embedBatch` is called on the OpenRouter or OpenAI adapter with multiple texts
- **THEN** the system SHALL return one vector per input text, in the same order, via a single underlying API
  call

#### Scenario: Anthropic batch embedding
- **WHEN** `embedBatch` is called on the Anthropic adapter
- **THEN** the system SHALL throw the same "does not support embeddings" error as `embed`, without making a
  network call
