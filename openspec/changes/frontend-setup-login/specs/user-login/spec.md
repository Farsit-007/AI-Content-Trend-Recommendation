## ADDED Requirements

### Requirement: Login page and form

The frontend SHALL provide a `/login` page with a form collecting email and password, validated client-side (valid email format, non-empty password) before submission.

#### Scenario: Client-side validation blocks invalid input

- **WHEN** the user submits the login form with an invalid email or empty password
- **THEN** the form shows a validation message and does not call the backend

#### Scenario: Submitting valid credentials calls the backend

- **WHEN** the user submits the form with a well-formed email and a password
- **THEN** the app sends `POST /auth/login` with those credentials

### Requirement: Successful login establishes a session

On a successful login response, the frontend SHALL persist the access token via the `tokenStore`, set the authenticated user in `AuthContext`, and redirect to the authenticated area.

#### Scenario: Login succeeds

- **WHEN** `POST /auth/login` returns a token and user
- **THEN** the token is stored via `tokenStore`, `AuthContext` reflects the user as authenticated, and the app navigates away from `/login`

#### Scenario: Authenticated request carries the token

- **WHEN** an authenticated API request is made after login
- **THEN** the request includes an `Authorization: Bearer <token>` header sourced from `tokenStore`

### Requirement: Failed login surfaces an error

On a failed login, the frontend SHALL display the backend's error message and SHALL NOT redirect or store a token.

#### Scenario: Wrong credentials

- **WHEN** `POST /auth/login` returns a 401 error envelope
- **THEN** a toast shows the backend's error message, no token is stored, and the user stays on `/login`

### Requirement: Session hydration on app boot

On application load, if a token exists in `tokenStore`, the frontend SHALL validate it via `GET /auth/me` to hydrate the current user, and SHALL clear the session if validation fails.

#### Scenario: Valid stored token

- **WHEN** the app boots with a valid token in `tokenStore`
- **THEN** `GET /auth/me` populates `AuthContext` and the user remains authenticated across reloads

#### Scenario: Invalid stored token

- **WHEN** the app boots with a token that `GET /auth/me` rejects
- **THEN** the token is cleared and the user is treated as unauthenticated

### Requirement: Protected route redirection

The frontend SHALL gate authenticated routes behind a `ProtectedRoute` wrapper that redirects unauthenticated users to `/login`, and SHALL redirect already-authenticated users away from `/login`.

#### Scenario: Unauthenticated access to a protected route

- **WHEN** an unauthenticated user navigates to a protected route
- **THEN** they are redirected to `/login`

#### Scenario: Authenticated user visits login

- **WHEN** an authenticated user navigates to `/login`
- **THEN** they are redirected to the authenticated area

### Requirement: Automatic access-token refresh on 401

When an authenticated request fails with 401, the API client SHALL perform a single-flight refresh via `POST /auth/refresh-token`, store the new token, and retry the original request once; if refresh fails, it SHALL clear the session and redirect to `/login`.

#### Scenario: Expired access token is refreshed transparently

- **WHEN** an authenticated request returns 401 and the refresh token is still valid
- **THEN** the client obtains a new access token, stores it, and retries the original request successfully without user interaction

#### Scenario: Concurrent 401s share one refresh

- **WHEN** multiple authenticated requests fail with 401 at the same time
- **THEN** only one `POST /auth/refresh-token` call is made and all pending requests are retried after it resolves

#### Scenario: Refresh fails

- **WHEN** the refresh request itself fails or is rejected
- **THEN** the session is cleared and the user is redirected to `/login`

### Requirement: Logout ends the session

The frontend SHALL provide a logout action that calls `POST /auth/logout`, clears the token and cached query data, and returns the user to `/login`.

#### Scenario: User logs out

- **WHEN** the user triggers logout
- **THEN** `POST /auth/logout` is called, the token is cleared from `tokenStore`, cached data is cleared, and the app navigates to `/login`
