## ADDED Requirements

### Requirement: 4-tier model resolution per task
The system SHALL resolve a model for a named task via, in order: an explicit request-level `llm_model_id`
override, the requesting team's `default_models[task]`, a global super-admin-set default for that task, and
finally a `.env`-configured bootstrap value — accepting the first tier that resolves to an active, correctly-
capable, reachable model.

#### Scenario: Request override takes priority over everything else
- **WHEN** a request supplies an `llm_model_id` that resolves to an active model with the required capability
- **THEN** the system SHALL use that model, regardless of any team or global default configured

#### Scenario: Team default used when no request override is supplied
- **WHEN** a request supplies no `llm_model_id`, and the requesting team has a `default_models[task]` entry
  resolving to an active, correctly-capable model
- **THEN** the system SHALL use the team's default model for that task

#### Scenario: Global default used when neither request nor team resolves
- **WHEN** no request override is supplied and the team has no default for the task (or the call has no team
  context at all)
- **THEN** the system SHALL use the super-admin-configured global default for that task, if one is active

#### Scenario: Bootstrap tier used when nothing is configured
- **WHEN** no `LlmProvider` records exist at all (a fresh deployment), or none resolve for a given task
- **THEN** the system SHALL fall back to the `.env`-configured bootstrap model, and this SHALL behave
  identically to this codebase's pre-existing static `chatCompletion`/`embed` behavior

### Requirement: Soft-fail-through on an invalid reference at any tier
An inactive, deleted, or wrong-capability model reference at the request, team, or global tier SHALL NOT be
treated as a hard error — resolution SHALL fall through to the next tier and log a warning.

#### Scenario: Request supplies an llm_model_id for an inactive model
- **WHEN** a request's `llm_model_id` resolves to a model whose `is_active` is `false`
- **THEN** the system SHALL log a warning and fall through to the team/global/bootstrap tiers, not fail the
  request

#### Scenario: Team default references a deleted model
- **WHEN** a team's `default_models[task]` references an `LlmModel` id that no longer exists
- **THEN** the system SHALL log a warning and fall through to the global/bootstrap tiers

### Requirement: Capability-aware resolution
The resolver SHALL only accept a model whose `capabilities` include the capability the task requires (`chat`
for every task except `embedding`, which requires `embedding`).

#### Scenario: A chat-only model is misconfigured as the embedding task's global default
- **WHEN** the `embedding` task's global default references a model whose `capabilities` is `['chat']` only
- **THEN** the system SHALL treat that tier as unresolved (capability mismatch) and fall through to the next
  tier, rather than attempting an embedding call against a chat-only model

### Requirement: Automatic failover to the next available active key on a transient failure
On a chat-completion failure against a resolved non-bootstrap model, the system SHALL retry once against the
next available active key/model the resolver would pick when excluding the one that just failed.

#### Scenario: Primary key fails, a second active key exists on the same or another provider
- **WHEN** a chat completion against the resolved model's key fails, and re-resolving while excluding that key
  yields a different active key
- **THEN** the system SHALL retry the request once against that different key, and return its result if
  successful

#### Scenario: No alternative key is available
- **WHEN** a chat completion fails and no other active key resolves for the task
- **THEN** the system SHALL propagate the original error rather than retrying indefinitely or silently
  swallowing the failure

### Requirement: Zero behavior change for existing deployments with no providers configured
For any deployment with zero `LlmProvider` records, every existing call site's observable behavior (model
used, failover behavior, error conditions) SHALL be identical to this codebase's behavior before this change.

#### Scenario: Fresh deployment, only .env configured
- **WHEN** a deployment has `OPENROUTER_API_KEY`/`LLM_MODEL_*` set in `.env` and zero `LlmProvider` documents
- **THEN** every chat-completion and embedding call SHALL resolve to the same models this codebase's static
  `LLM_MODELS`/`config.embedding_model` values already specify, via the same underlying OpenRouter client
