## ADDED Requirements

### Requirement: Vector-search-capable MongoDB connection
The backend SHALL connect to a MongoDB deployment that supports the `$vectorSearch` aggregation stage. The connection string SHALL be sourced from `DATABASE_URL` and SHALL NOT point at a plain `mongo:7-jammy` (or equivalent non-Atlas) image.

#### Scenario: Server connects to Atlas on startup
- **WHEN** the backend process starts with a valid Atlas M0 `DATABASE_URL`
- **THEN** the Mongoose connection succeeds and a `$vectorSearch` test query against the cluster does not error with "unknown stage"

#### Scenario: Local non-Atlas Mongo is no longer configured
- **WHEN** `docker-compose.yml` is inspected
- **THEN** it SHALL NOT define a local `mongodb` service that the backend depends on for its primary `DATABASE_URL`

### Requirement: Verified embedding provider on OpenRouter
The backend SHALL use an embedding provider confirmed to work via a live test call, not an assumed one. Embeddings SHALL be served through OpenRouter (via the `openai` SDK pointed at OpenRouter's `baseURL`), the same provider as the LLM client, so there is one API key and one client library for both — no local model runtime (e.g. Ollama) required on any machine running the backend.

#### Scenario: Embedding call returns a usable vector
- **WHEN** `embed(text)` is called with a non-empty string
- **THEN** it SHALL return a numeric vector of the provider's fixed dimension (1536 for `openai/text-embedding-3-small`) without throwing

#### Scenario: Provider choice is documented, not hardcoded assumption
- **WHEN** a developer reads this change's design notes
- **THEN** they SHALL find which provider was verified to work and why, and that the final choice consolidated on OpenRouter for both LLM and embeddings (not the initial local-Ollama fallback)

### Requirement: OpenRouter LLM client with configured models
The backend SHALL expose a shared LLM client wrapping OpenRouter's chat completions endpoint, configured with the model names defined for each task (categorization/report/chat, content generation, fallback), reading the API key from environment configuration.

#### Scenario: Chat completion succeeds with a configured model
- **WHEN** a caller invokes the LLM client with a task-specific model name and a prompt
- **THEN** it SHALL return the model's text completion using `OPENROUTER_API_KEY` for auth

#### Scenario: Fallback model is available
- **WHEN** the primary model for a task is unavailable or rate-limited
- **THEN** the client SHALL expose the fallback model (`google/gemma-2-9b-it:free`) as a documented, callable alternative

### Requirement: Shared Redis client
The backend SHALL expose a single shared Redis connection (via `ioredis`) importable by other backend modules, configured from `REDIS_URL`.

#### Scenario: Redis connects on startup
- **WHEN** the backend process starts with a valid `REDIS_URL`
- **THEN** a `PING` against the shared client SHALL succeed before the HTTP server begins accepting requests

### Requirement: Fail-fast startup connectivity check
The backend SHALL verify Mongo, Redis, and LLM/embedding connectivity before it starts accepting HTTP traffic, and SHALL exit with a clear error message if any check fails.

#### Scenario: Misconfigured dependency blocks startup
- **WHEN** `DATABASE_URL`, `REDIS_URL`, or `OPENROUTER_API_KEY` is missing or invalid
- **THEN** the process SHALL log a specific error identifying which dependency failed and SHALL exit instead of starting the HTTP server

#### Scenario: Healthy configuration starts cleanly
- **WHEN** all required environment variables are valid and reachable
- **THEN** the backend SHALL log successful connectivity for Mongo, Redis, and the LLM client, then start listening on `PORT`

### Requirement: Scaffold excludes out-of-scope boilerplate
The backend SHALL NOT include authentication, user-account, image-upload, or email-sending code, since none of these are required by any functional requirement in the product spec.

#### Scenario: No auth/user modules remain
- **WHEN** `backend/src/app/modules/` is inspected after this change
- **THEN** it SHALL NOT contain `Auth/` or `User/` directories, and `backend/src/app/routes/index.ts` SHALL NOT register auth or user routes
