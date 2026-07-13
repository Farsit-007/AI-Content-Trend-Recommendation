## ADDED Requirements

### Requirement: users collection schema
The backend SHALL expose a Mongoose model for `users` with `email` (unique, lowercased), `password_hash` (never selected by default), `name`, and `created_at`.

#### Scenario: User model is importable
- **WHEN** another backend module imports `backend/src/app/modules/User/user.model.ts`
- **THEN** it SHALL receive a typed Mongoose model targeting the `users` collection

#### Scenario: Email uniqueness enforced
- **WHEN** two `users` documents are inserted with the same `email`
- **THEN** the second insert SHALL fail a unique-index constraint at the database level

#### Scenario: Password hash is never exposed
- **WHEN** a user document is serialized into an API response
- **THEN** `password_hash` SHALL be absent from the response body

### Requirement: User registration
The backend SHALL accept `POST /api/v1/auth/register` with `email`, `password`, and `name`, hash the password with bcrypt, persist the user, and return the created user without its password hash.

#### Scenario: Successful registration
- **WHEN** a request is made with a well-formed email, a password of at least 8 characters, and a name
- **THEN** the response SHALL be `201` and a `users` document SHALL exist whose `password_hash` is a bcrypt hash — never the plaintext password

#### Scenario: Duplicate email rejected
- **WHEN** registration is attempted with an email that already exists
- **THEN** the response SHALL be a `409` conflict error, and no second user SHALL be created

#### Scenario: Weak or malformed input rejected
- **WHEN** registration is attempted with a malformed email or a password shorter than 8 characters
- **THEN** the response SHALL be a `400` validation error produced by the existing zod `validation` middleware

### Requirement: User login issues a JWT
The backend SHALL accept `POST /api/v1/auth/login` with `email` and `password`, verify the password against the stored bcrypt hash, and return a signed HS256 JWT on success.

#### Scenario: Successful login
- **WHEN** valid credentials are supplied
- **THEN** the response SHALL be `200` and contain a JWT signed with `JWT_SECRET` whose payload identifies the user

#### Scenario: Invalid credentials rejected
- **WHEN** the email does not exist, or the password does not match the stored hash
- **THEN** the response SHALL be `401` with an identical, non-enumerating message in both cases

### Requirement: requireAuth middleware
The backend SHALL provide a `requireAuth` middleware that verifies a bearer JWT, loads the user, and attaches `req.user` — rejecting missing, malformed, expired, or invalid-signature tokens.

#### Scenario: Valid bearer token accepted
- **WHEN** a request carries `Authorization: Bearer <valid JWT>` to a guarded route
- **THEN** the middleware SHALL populate `req.user` with the authenticated user's id and email and call `next()`

#### Scenario: Missing or invalid token rejected
- **WHEN** a request to a guarded route has no `Authorization` header, a malformed header, an expired token, or a token with an invalid signature
- **THEN** the middleware SHALL throw `AppError(401)` routed through the existing global error handler, and the guarded handler SHALL NOT execute

#### Scenario: Existing resource endpoints remain unguarded
- **WHEN** an unauthenticated request is made to `/api/v1/news-items`, `/api/v1/platform-posts`, or `/api/v1/brand-voice-examples`
- **THEN** it SHALL succeed exactly as it did before this change, preserving the published `api-contract-openapi` contract
