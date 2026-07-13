## ADDED Requirements

### Requirement: platform_credentials collection schema
The backend SHALL expose a Mongoose model for `platform_credentials` with `user_id`, `platform` (`facebook` | `youtube` | `linkedin`), encrypted `access_token`, encrypted `refresh_token` (nullable), `expires_at`, `scopes`, `status` (`active` | `needs_reauth` | `revoked`), `external_account_id`, `external_account_name`, and `connected_at`.

#### Scenario: One credential per user per platform
- **WHEN** a second credential is inserted for a `(user_id, platform)` pair that already exists
- **THEN** the insert SHALL fail a compound unique-index constraint at the database level

#### Scenario: Tokens are never stored in plaintext
- **WHEN** a credential is persisted and the raw document is read directly from MongoDB
- **THEN** `access_token` and `refresh_token` SHALL be AES-256-GCM ciphertext in the versioned `v1:<iv>:<authTag>:<ciphertext>` format, and the plaintext token SHALL NOT appear anywhere in the document

#### Scenario: Tokens are never returned by the API
- **WHEN** any endpoint serializes a credential into a response
- **THEN** `access_token` and `refresh_token` SHALL be absent from the response body

### Requirement: Token encryption helper
The backend SHALL provide `encrypt`/`decrypt` helpers using AES-256-GCM with a random per-encryption IV and an authentication tag, keyed by `CREDENTIAL_ENCRYPTION_KEY`.

#### Scenario: Round-trip
- **WHEN** a token is encrypted and then decrypted with the same key
- **THEN** the result SHALL equal the original plaintext exactly

#### Scenario: Tampered ciphertext is rejected
- **WHEN** any byte of a stored ciphertext or its auth tag is modified and decryption is attempted
- **THEN** decryption SHALL throw rather than return corrupted plaintext

#### Scenario: Invalid key length fails at boot
- **WHEN** the server starts with a `CREDENTIAL_ENCRYPTION_KEY` that does not decode to exactly 32 bytes
- **THEN** startup SHALL fail with a readable configuration error rather than throwing on first use

### Requirement: OAuth connect flow
The backend SHALL expose `GET /api/v1/credentials/:platform/connect` (authenticated) returning the provider's authorize URL with a signed, single-use, time-limited `state` parameter.

#### Scenario: Authorize URL is returned
- **WHEN** an authenticated user requests a connect URL for a configured platform
- **THEN** the response SHALL contain the provider's authorize URL including the registered redirect URI, the platform's required scopes, and a `state` JWT encoding the requesting user and platform

#### Scenario: Unconfigured platform
- **WHEN** a connect URL is requested for a platform whose OAuth client id/secret are not configured
- **THEN** the response SHALL be a clear error stating the platform is not configured — not a crash or a malformed URL

#### Scenario: Unauthenticated request rejected
- **WHEN** the connect endpoint is called without a valid bearer token
- **THEN** the response SHALL be `401`

### Requirement: OAuth callback persists an encrypted credential
The backend SHALL expose `GET /api/v1/credentials/:platform/callback`, which verifies `state`, exchanges the authorization code for tokens, resolves the platform account identity, and persists the credential with encrypted tokens against the user encoded in `state`.

#### Scenario: Successful connection
- **WHEN** the provider redirects back with a valid code and a valid, unconsumed `state`
- **THEN** a `platform_credentials` document SHALL be upserted for that `(user_id, platform)` with encrypted tokens, `status: 'active'`, and the resolved `external_account_id`

#### Scenario: Invalid or replayed state rejected
- **WHEN** the callback receives a `state` that is missing, expired, tampered with, or already consumed
- **THEN** the exchange SHALL be rejected and no credential SHALL be written

#### Scenario: Facebook page token exchange
- **WHEN** the Facebook callback completes
- **THEN** the stored `access_token` SHALL be a long-lived **page** token obtained by exchanging the short-lived user token — not the short-lived user token itself

#### Scenario: Google refresh token obtained
- **WHEN** the YouTube/Google authorize URL is constructed
- **THEN** it SHALL request offline access so the callback receives a `refresh_token` that can outlive the ~1h access token

### Requirement: Credential resolution with env bootstrap fallback
The backend SHALL provide `getPlatformToken(platform, userId?)` as the single accessor for platform tokens, resolving in order: the given user's stored credential, else the most recent active credential for that platform, else the `.env` bootstrap token, else a clear "not connected" error.

#### Scenario: Analytics works on a cold database with no users
- **WHEN** `getPlatformToken('facebook')` is called with no stored credentials but `FB_PAGE_TOKEN` set in the environment
- **THEN** it SHALL return the environment token, so `facebook-analytics` / `youtube-analytics` / `linkedin-analytics` are not blocked on any user completing an OAuth flow

#### Scenario: Stored credential preferred over env
- **WHEN** an active stored credential exists for the platform
- **THEN** the stored (decrypted, refreshed-if-needed) token SHALL be returned in preference to the environment bootstrap token

#### Scenario: Unconnected platform surfaces a handled error
- **WHEN** no stored credential and no environment token exist for a platform
- **THEN** the call SHALL throw a typed `AppError` that callers can render as "connected but pending approval" — never an unhandled `500` or an `undefined` token sent to a platform API

### Requirement: Refresh on read
The backend SHALL refresh an expired or near-expiry access token using its stored refresh token before returning it, and SHALL mark the credential `needs_reauth` when refresh fails.

#### Scenario: Expired token refreshed transparently
- **WHEN** `getPlatformToken()` resolves a credential whose `expires_at` is in the past or within the 5-minute skew window, and a refresh token is present
- **THEN** it SHALL exchange the refresh token for a new access token, persist it re-encrypted with an updated `expires_at`, and return the new token — the caller SHALL NOT observe the expiry

#### Scenario: Failed refresh is actionable
- **WHEN** the provider rejects the refresh token (revoked or expired)
- **THEN** the credential's `status` SHALL be set to `needs_reauth` and a clear error SHALL be thrown, rather than returning a stale token that would fail with an opaque `401` at the platform

### Requirement: Credential listing and disconnect
The backend SHALL expose authenticated `GET /api/v1/credentials` and `DELETE /api/v1/credentials/:platform` for the calling user.

#### Scenario: Listing shows status without secrets
- **WHEN** an authenticated user lists their credentials
- **THEN** each entry SHALL report `platform`, `status`, `external_account_name`, and `connected_at`, and SHALL contain no token material

#### Scenario: Disconnect removes the credential
- **WHEN** an authenticated user disconnects a platform
- **THEN** their credential for that platform SHALL be removed, and a subsequent `getPlatformToken()` for that user SHALL fall back to the next resolution step

#### Scenario: Users cannot touch another user's credentials
- **WHEN** an authenticated user disconnects a platform
- **THEN** only their own `(user_id, platform)` credential SHALL be affected

### Requirement: Live credential verification script
The backend SHALL provide a `verify:credentials` script that resolves a token per platform and makes a read-only identity call, reporting PASS, FAIL, or SKIP per platform.

#### Scenario: Configured platform passes
- **WHEN** the script runs with a valid, resolvable credential for a platform
- **THEN** the identity call SHALL succeed and the script SHALL report PASS for that platform

#### Scenario: Unconfigured platform is skipped, not failed
- **WHEN** the script runs with no credential and no environment token for a platform — the expected LinkedIn-pending-approval state per `project-ida-requirments.md` §5.6
- **THEN** the script SHALL report SKIP for that platform and SHALL NOT fail the run or block the other platforms

#### Scenario: Invalid credential fails loudly
- **WHEN** a token is present but rejected by the platform
- **THEN** the script SHALL report FAIL for that platform with the provider's error, rather than reporting a false PASS on the basis that a token merely exists
