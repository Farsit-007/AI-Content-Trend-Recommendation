## ADDED Requirements

### Requirement: Super-admin-only access to the LLM provider registry
Every `/llm-providers` route SHALL require an authenticated super_admin (`requireAuth` + `requireSuperAdmin`).

#### Scenario: Non-super-admin attempts to list providers
- **WHEN** a request to `GET /llm-providers` is made by an authenticated user whose role is not `super_admin`
- **THEN** the system SHALL respond 403 and SHALL NOT return any provider data

#### Scenario: Unauthenticated request
- **WHEN** a request to any `/llm-providers` route is made without a valid auth token
- **THEN** the system SHALL respond 401

### Requirement: Provider CRUD
The system SHALL allow a super_admin to create, list, read, update, and delete `LlmProvider` records, each
with a `provider_type` of `openrouter`, `anthropic`, or `openai`.

#### Scenario: Create a provider
- **WHEN** a super_admin submits `POST /llm-providers` with a valid `provider_type` and `name`
- **THEN** the system SHALL create the provider with zero keys and zero models, and return it

#### Scenario: Create a provider with an invalid provider_type
- **WHEN** a super_admin submits `POST /llm-providers` with a `provider_type` outside
  `openrouter`/`anthropic`/`openai`
- **THEN** the system SHALL reject the request with a validation error and SHALL NOT create a record

#### Scenario: Delete a provider cascades its models
- **WHEN** a super_admin deletes a provider that has one or more `LlmModel` rows
- **THEN** the system SHALL also delete every `LlmModel` row referencing that provider

### Requirement: Encrypted API key storage, masked by default
Every API key added to a provider SHALL be encrypted at rest (AES-256-GCM) and SHALL never appear in plaintext
in any list or read response.

#### Scenario: Add a key to a provider
- **WHEN** a super_admin submits `POST /llm-providers/:id/keys` with a plaintext API key
- **THEN** the system SHALL store the key encrypted, SHALL compute and store its last 4 characters as
  `key_last4`, and SHALL NOT store or return the plaintext key in the creation response beyond `key_last4`

#### Scenario: List or read a provider after adding keys
- **WHEN** a super_admin requests `GET /llm-providers` or `GET /llm-providers/:id`
- **THEN** each key in the response SHALL show only `key_last4` and metadata (`label`, `is_active`,
  `created_at`), and SHALL NOT include the encrypted ciphertext or the plaintext key

### Requirement: Explicit key reveal
The system SHALL provide a dedicated endpoint that decrypts and returns a key's real plaintext value,
accessible only to a super_admin.

#### Scenario: Reveal an existing key
- **WHEN** a super_admin calls `POST /llm-providers/:id/keys/:keyId/reveal` for a key that exists on that
  provider
- **THEN** the system SHALL decrypt and return the original plaintext key value

#### Scenario: Reveal a key that does not exist
- **WHEN** a super_admin calls the reveal endpoint with a `keyId` that does not belong to the given provider
- **THEN** the system SHALL respond 404 and SHALL NOT leak whether a differently-scoped key with that id
  exists elsewhere

### Requirement: A provider can hold multiple keys, each independently toggled
The system SHALL allow more than one API key per provider, and SHALL allow each key's `is_active` flag to be
toggled independently without affecting other keys on the same provider.

#### Scenario: Deactivate one of several keys
- **WHEN** a provider has two active keys and a super_admin sets one key's `is_active` to `false`
- **THEN** that key SHALL no longer be considered active, and the provider's other key SHALL remain unaffected

### Requirement: Per-provider model catalog
The system SHALL allow a super_admin to create, list, update, and delete `LlmModel` entries scoped to a
specific provider, each carrying a model id string, a display name, one or more capability tags
(`chat`/`embedding`), and an `is_active` flag.

#### Scenario: Add a model to a provider
- **WHEN** a super_admin submits `POST /llm-providers/:id/models` with a `model_id`, `display_name`, and
  `capabilities` array
- **THEN** the system SHALL create the model scoped to that provider and return it

#### Scenario: List models for a provider
- **WHEN** a super_admin calls `GET /llm-providers/:id/models`
- **THEN** the system SHALL return only models whose `provider_id` matches `:id`

### Requirement: Shared provider adapter interface across OpenRouter, Anthropic, and OpenAI
The system SHALL expose one `LlmProviderAdapter` interface (`chatCompletion`, `embed`) with a concrete,
independently invocable implementation for each of `openrouter`, `anthropic`, and `openai`.

#### Scenario: Resolve an adapter for a known provider_type
- **WHEN** the adapter resolver is called with `provider_type: 'anthropic'` and a decrypted API key
- **THEN** it SHALL return an object implementing both `chatCompletion` and `embed`

#### Scenario: Anthropic adapter's embed is called
- **WHEN** the Anthropic adapter's `embed` method is invoked
- **THEN** it SHALL throw a clear error stating Anthropic does not support embeddings, rather than making a
  network call or silently returning an empty/invalid vector

### Requirement: Zero integration with existing serving paths
This change SHALL NOT alter the behavior, call signature, or resolution logic of the existing
`llmClient.ts#chatCompletion` or `embeddings.ts#embed`/`embedBatch` functions, or any of their existing call
sites.

#### Scenario: Existing content generation call site after this change ships
- **WHEN** `POST /content/generate` (or any other existing LLM call site) executes after this change is
  deployed
- **THEN** it SHALL resolve its model and provider exactly as it did before this change, via the existing
  static `LLM_MODELS`/`config` values, unaffected by the new `LlmProvider`/`LlmModel` collections
