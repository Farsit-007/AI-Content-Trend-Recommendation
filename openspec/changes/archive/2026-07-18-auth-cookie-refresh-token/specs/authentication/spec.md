## ADDED Requirements

### Requirement: In-memory access token storage

The frontend SHALL hold the access token in memory only and SHALL NOT persist it to `localStorage`, `sessionStorage`, or any non-httpOnly cookie. The httpOnly refresh cookie set by the backend SHALL be the only persisted credential.

#### Scenario: Token is never written to web storage

- **WHEN** a user logs in successfully
- **THEN** the access token is kept in an in-memory holder
- **AND** no access token value is present in `localStorage` or `sessionStorage`

#### Scenario: Token is dropped when the tab is closed

- **WHEN** the browser tab is closed and reopened
- **THEN** the in-memory access token is gone
- **AND** the session is re-established from the refresh cookie (see silent boot rehydration)

### Requirement: Silent session rehydration on app boot

On application boot or full page reload, the frontend SHALL attempt to mint a fresh access token by calling `POST /auth/refresh-token`, relying on the browser to send the httpOnly refresh cookie automatically. On success it SHALL load the current user; on failure it SHALL treat the visitor as unauthenticated without redirecting from public routes.

#### Scenario: Returning user with a valid refresh cookie

- **WHEN** the app boots and a valid refresh cookie is present
- **THEN** the frontend calls `POST /auth/refresh-token`, receives a new access token into memory
- **AND** loads the current user via `GET /auth/me`
- **AND** renders the app as authenticated without a login prompt

#### Scenario: Visitor with no or expired refresh cookie

- **WHEN** the app boots and no valid refresh cookie is present
- **THEN** the refresh call fails and the frontend renders as unauthenticated
- **AND** protected routes redirect to `/login` while public routes render normally

### Requirement: Transparent access-token refresh on 401

The axios instance SHALL, on a `401` response for a non-auth request, obtain a new access token from the refresh cookie via `POST /auth/refresh-token`, retry the original request exactly once, and reject if the refresh itself fails. Concurrent `401`s SHALL share a single in-flight refresh (single-flight), and the refresh request SHALL NOT re-enter the interceptor.

#### Scenario: Expired access token is renewed and the request retried

- **WHEN** a request returns `401` because the in-memory access token has expired
- **THEN** the interceptor refreshes the token once, updates the in-memory holder and the request Authorization header
- **AND** retries the original request, returning its result to the caller transparently

#### Scenario: Concurrent 401s trigger a single refresh

- **WHEN** multiple requests fail with `401` at the same time
- **THEN** only one `POST /auth/refresh-token` call is made
- **AND** all queued requests are retried with the same new access token

#### Scenario: Refresh fails — session ends

- **WHEN** the refresh call itself returns `401`/fails (expired or missing refresh cookie)
- **THEN** the in-memory token is cleared and the user is redirected to `/login`
- **AND** the original request is rejected with a normalized error

### Requirement: Login establishes a cookie-first session

The system SHALL authenticate a user via `POST /auth/login`, set the httpOnly refresh cookie server-side, and return the access token in the response body for the client to hold in memory. Auth actions SHALL be exposed to components through TanStack Query mutations.

#### Scenario: Successful login

- **WHEN** a user submits valid credentials
- **THEN** the backend sets the httpOnly refresh cookie and returns the access token and user
- **AND** the frontend stores the access token in memory and marks the session authenticated

#### Scenario: Invalid credentials

- **WHEN** a user submits an incorrect email or password
- **THEN** the login mutation rejects with a single generic "Invalid email or password" error
- **AND** no cookie or in-memory token is set

### Requirement: Logout clears the session

The system SHALL clear the httpOnly refresh cookie via `POST /auth/logout`, and the frontend SHALL clear the in-memory access token and cached query data, then redirect to `/login`.

#### Scenario: User logs out

- **WHEN** an authenticated user triggers logout
- **THEN** the backend clears the refresh cookie
- **AND** the frontend clears the in-memory token, clears the query cache, and navigates to `/login`

#### Scenario: Logout is resilient to a failing request

- **WHEN** the logout request fails or times out
- **THEN** the frontend still clears its local session and navigates to `/login`

### Requirement: Change password for authenticated users

The system SHALL let an authenticated user change their password via `POST /auth/change-password` by supplying the current and new password. On success the backend SHALL invalidate previously issued tokens, issue a rotated token pair (setting a fresh refresh cookie), and the frontend SHALL adopt the new access token so the session survives without re-login.

#### Scenario: Successful password change keeps the session alive

- **WHEN** an authenticated user submits a correct current password and a valid new password
- **THEN** the backend rotates the tokens and sets a fresh refresh cookie
- **AND** the frontend replaces its in-memory access token with the new one and shows a success message

#### Scenario: Wrong current password

- **WHEN** the supplied current password is incorrect
- **THEN** the mutation rejects with "Current password is incorrect"
- **AND** the password is not changed

#### Scenario: New password fails policy

- **WHEN** the new password is shorter than 8 characters
- **THEN** the form blocks submission with a validation message

### Requirement: Forgot password request

The system SHALL accept an email at `POST /auth/forgot-password` and respond with an identical, non-enumerating message whether or not an account exists. Outside production, a reset token MAY be returned in the response body for development.

#### Scenario: Request for any email returns the same response

- **WHEN** a user submits an email to the forgot-password form
- **THEN** the UI shows "If an account exists for that email, a password reset token has been issued"
- **AND** the response does not reveal whether the email has an account

### Requirement: Reset password with a token

The system SHALL let a user set a new password via `POST /auth/reset-password` using a single-use reset token. On success the reset token and all earlier tokens SHALL be invalidated and the user SHALL be directed to log in.

#### Scenario: Valid reset token

- **WHEN** a user submits a valid reset token and a valid new password
- **THEN** the password is updated and the user is redirected to `/login` with a success message

#### Scenario: Invalid or expired reset token

- **WHEN** the reset token is missing, malformed, expired, or already used
- **THEN** the mutation rejects with "Invalid or expired reset token"
- **AND** the password is not changed
