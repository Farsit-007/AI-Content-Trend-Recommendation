## ADDED Requirements

### Requirement: Facebook Page connect flow

The system SHALL let an authenticated team admin initiate an official Meta OAuth flow to connect a Facebook Page they administer, using the server-side Authorization Code flow (no JavaScript SDK) against the pinned Graph API version.

#### Scenario: Admin requests a connect URL

- **WHEN** a team admin calls `GET /oauth/facebook/connect?teamId=<id>`
- **THEN** the system generates a random 32-byte `state`, stores `oauth:fb:{state} → {teamId, userId}` in Redis with a 10-minute TTL, and returns `{ url }` pointing at `https://www.facebook.com/{GRAPH_API_VERSION}/dialog/oauth` with `client_id`, the exact configured `redirect_uri`, `state`, `response_type=code`, and the scope set `public_profile,pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights`.

#### Scenario: Non-admin is rejected

- **WHEN** a user without team-admin access calls the connect endpoint
- **THEN** the system responds with a 403 and does not create a `state` entry.

### Requirement: OAuth callback and ownership proof

The system SHALL handle the Meta redirect callback on an unauthenticated route, validate the `state`, exchange the code for a long-lived user token, validate granted scopes, and list the administered Pages (with per-Page tokens) as the ownership proof.

#### Scenario: Valid callback produces pending candidates

- **WHEN** Meta redirects to `GET /oauth/facebook/callback?code=<c>&state=<s>` with a `state` present in Redis
- **THEN** the system deletes the `state` key (single-use), exchanges the code for a short-lived then long-lived user token, calls `debug_token` to confirm validity and required scopes, calls `/me/accounts` to obtain the Pages and their long-lived Page tokens plus any `instagram_business_account`, stores the encrypted candidate list at `oauth:fb:pending:{teamId}` (15-minute TTL), and redirects the browser to `{WEB_URL}/dashboard/settings/platforms?fb=pick`.

#### Scenario: Invalid or reused state is rejected

- **WHEN** the callback arrives with a `state` that is missing, expired, or already consumed in Redis
- **THEN** the system rejects the request with a 4xx and persists no credentials.

#### Scenario: Missing required scopes

- **WHEN** `debug_token` shows the granted scopes do not include the full required set
- **THEN** the system redirects to the frontend with `?error=missing_permissions&missing=<comma-separated>` and persists nothing.

#### Scenario: User administers no Pages

- **WHEN** `/me/accounts` returns an empty list
- **THEN** the system redirects to the frontend with `?error=no_pages`.

### Requirement: Page selection and persistence

The system SHALL let the admin choose one pending Page and persist only that Page's credential (plus the linked Instagram row when present), then enable the platforms and trigger an immediate refresh.

#### Scenario: List pending pages without tokens

- **WHEN** a team admin calls `GET /oauth/facebook/pages?teamId=<id>`
- **THEN** the system returns the pending candidates (id, name, picture, IG-linked badge) with no access tokens in the payload.

#### Scenario: Select a page persists encrypted credentials

- **WHEN** a team admin calls `POST /oauth/facebook/select-page { pageId }` for a pending page
- **THEN** the system re-validates the Page token via `debug_token` (confirming `type: PAGE` and `profile_id == pageId`), upserts an encrypted `facebook` `PlatformCredential`, upserts an `instagram` credential with the same encrypted Page token and `ig_user_id` when `instagram_business_account` exists, ensures the `facebook`/`instagram` `TeamPlatform` rows are enabled, deletes the Redis pending key, and triggers `runAnalyticsRefresh({ teamId })`.

### Requirement: Disconnect and revocation

The system SHALL let a team admin disconnect a connected Page, revoking the grant on Meta's side and removing stored credentials.

#### Scenario: Admin disconnects

- **WHEN** a team admin calls `DELETE /oauth/facebook?teamId=<id>`
- **THEN** the system calls Meta to revoke permissions for the Page (and the user grant when still held), deletes the `facebook` and `instagram` `PlatformCredential` rows, and upserts `not_connected` rollups for those platforms.

### Requirement: Data-deletion callback

The system SHALL expose a signed-request data-deletion callback so Meta can request removal of a user's stored data.

#### Scenario: Valid signed request deletes credentials

- **WHEN** Meta calls `POST /oauth/facebook/data-deletion` with a `signed_request` whose HMAC-SHA256 signature verifies against the app secret
- **THEN** the system deletes all `PlatformCredential` rows connected by that Meta user and responds with `{ url, confirmation_code }`.

#### Scenario: Invalid signature is rejected

- **WHEN** the `signed_request` signature does not verify
- **THEN** the system rejects the request and deletes nothing.

### Requirement: Token and credential security

The system SHALL protect all Meta tokens at rest and in transit to the Graph API.

#### Scenario: Tokens stored encrypted and app-secret-proofed

- **WHEN** the system persists a Page token or calls any server-side Graph endpoint
- **THEN** the token is stored AES-256-GCM encrypted with `select: false`, and every Graph call includes an `appsecret_proof` HMAC-SHA256 of the token keyed by the app secret.
