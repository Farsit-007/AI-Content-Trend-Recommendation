## ADDED Requirements

### Requirement: Isolated test environment
The backend test suite SHALL run against an in-memory MongoDB instance and a mocked Redis client, with no network dependency on the real MongoDB Atlas cluster, real Redis instance, or real OpenRouter API. Running `npm test` from `backend/` SHALL succeed with only `npm install` as a prerequisite (plus a one-time `mongodb-memory-server` binary download).

#### Scenario: Running the suite requires no external services
- **WHEN** a developer runs `npm test` in `backend/` with no `DATABASE_URL`, `REDIS_URL`, or `OPENROUTER_API_KEY` pointing at real services (only the committed `.env.test` placeholder values)
- **THEN** the full suite runs to completion without attempting any real network connection to MongoDB Atlas, Redis, or OpenRouter

#### Scenario: Suite is repeatable and isolated between test files
- **WHEN** the test suite is run twice in a row
- **THEN** both runs produce the same pass/fail result, with no leftover data from one run affecting the other (each test file starts from an empty in-memory database)

### Requirement: Auth and team lifecycle coverage
Integration tests SHALL exercise login, `/auth/me`, admin-only user creation/listing, and team CRUD (create, list, get, update, delete, add/remove member) through the real Express app and real Mongoose models, including the 401/403 failure paths enforced by `requireAuth`, `requireAdmin`, and `requireTeamAccess`.

#### Scenario: Successful login returns a usable token
- **WHEN** a seeded user POSTs valid credentials to `/api/v1/auth/login`
- **THEN** the response is 200 and includes a JWT that subsequently authenticates requests to `/api/v1/auth/me`

#### Scenario: Unauthenticated request is rejected
- **WHEN** a request is made to an auth-gated route (e.g. `GET /api/v1/auth/me`) with no `Authorization` header
- **THEN** the response is 401

#### Scenario: Non-admin cannot create a user
- **WHEN** a non-admin authenticated user POSTs to `/api/v1/users`
- **THEN** the response is 403

#### Scenario: Admin can create a team and add a member
- **WHEN** an admin authenticated user POSTs a valid payload to `/api/v1/teams` and then POSTs a member to `/api/v1/teams/:teamId/members`
- **THEN** both responses are 2xx, and the created team's member list includes the added user

#### Scenario: Non-member cannot access another team's resource
- **WHEN** an authenticated non-admin user who is not a member of `teamId` requests `GET /api/v1/teams/:teamId`
- **THEN** the response is 403

### Requirement: Platform credential coverage
Integration tests SHALL exercise upserting, listing, revealing, and deleting a team's platform credentials via the team-scoped `/api/v1/teams/:teamId/credentials` routes, confirming that access is gated by team membership and that a revealed credential round-trips correctly through the encryption/decryption path.

#### Scenario: Team member can upsert and reveal a credential
- **WHEN** a team member POSTs a credential payload to `/api/v1/teams/:teamId/credentials` and then GETs `/api/v1/teams/:teamId/credentials/:platform/reveal`
- **THEN** the upsert response is 2xx and the revealed value matches what was submitted

#### Scenario: Outsider cannot list a team's credentials
- **WHEN** an authenticated user who is not a member of `teamId` and not an admin requests `GET /api/v1/teams/:teamId/credentials`
- **THEN** the response is 403

### Requirement: News item coverage
Integration tests SHALL exercise creating, listing (with `optionalAuth`, both authenticated and unauthenticated), fetching by id, updating, deleting, and admin-only ingestion-triggering for news items, as well as setting/clearing a category override.

#### Scenario: Unauthenticated user can list news items
- **WHEN** an unauthenticated request is made to `GET /api/v1/news-items`
- **THEN** the response is 200 and returns the list of news items

#### Scenario: Non-admin cannot trigger ingestion
- **WHEN** a non-admin authenticated user POSTs to `/api/v1/news-items/ingest`
- **THEN** the response is 403

#### Scenario: Authenticated user can set a category override
- **WHEN** an authenticated user PATCHes `/api/v1/news-items/:id/override` with a valid category payload
- **THEN** the response is 2xx and a subsequent fetch of that news item reflects the overridden category

### Requirement: Content generation coverage
Integration tests SHALL exercise the `POST /api/v1/content-generation/generate` route with the OpenRouter client mocked, covering a successful generation and the unauthenticated-rejection path, without making any real LLM API call.

#### Scenario: Authenticated user generates content
- **WHEN** an authenticated user POSTs a valid generation request to `/api/v1/content-generation/generate` while the OpenRouter client is mocked to return a canned completion
- **THEN** the response is 200 and contains generated content derived from the mocked completion, and no real OpenRouter API call is made

#### Scenario: Unauthenticated request is rejected
- **WHEN** an unauthenticated request is made to `/api/v1/content-generation/generate`
- **THEN** the response is 401

### Requirement: Chat coverage
Integration tests SHALL exercise the `POST /api/v1/chat` route with the OpenRouter client mocked, covering a successful multi-turn chat exchange and the unauthenticated-rejection path, without making any real LLM API call.

#### Scenario: Authenticated user asks a chat question
- **WHEN** an authenticated user POSTs a valid question to `/api/v1/chat` while the OpenRouter client is mocked to return a canned completion
- **THEN** the response is 200 and contains an answer derived from the mocked completion, and no real OpenRouter API call is made

#### Scenario: Unauthenticated request is rejected
- **WHEN** an unauthenticated request is made to `/api/v1/chat`
- **THEN** the response is 401
