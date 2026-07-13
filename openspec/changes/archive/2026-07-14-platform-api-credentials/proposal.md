## Why

Robayat's three analytics changes (`facebook-analytics` FR-06/FR-26, `youtube-analytics` FR-07, `linkedin-analytics` FR-08) all call out to Meta / YouTube / LinkedIn APIs, and none of them can authenticate today. `backend/src/app/config/index.ts` holds only infra + OpenRouter keys — there is no Facebook page token, no YouTube API key, no LinkedIn token anywhere in the backend. This change is the Day-1 foundation (`SPEC-DRIVEN-WORKFLOW.md` row #4) that unblocks all three.

**This change deliberately goes beyond the original planned scope — flagged here for PR review.** `MASTER-PLAN.md:49`, `SPEC-DRIVEN-WORKFLOW.md:136`, and `ROBAYAT.md:20` all scope `platform-api-credentials` as "Meta / YouTube / LinkedIn app setup + long-lived tokens → `.env`" — a single set of app-owned secrets, no user accounts. The owner (Robayat) has decided to build a **per-user OAuth credential store** instead: users authenticate into Growth Studio, connect their own social accounts via OAuth, and their tokens are stored encrypted per user. That requires user identity, which the backend also does not have today (no User model, no auth middleware, no JWT dependency), so authentication is built here too.

The critical-path risk this creates is that a pure per-user store gives the analytics jobs **nothing to authenticate with until a human logs in and connects an account** — which would block three downstream changes on a manual step. This change therefore also ships a single credential-resolution accessor with an `.env` bootstrap path, so the analytics changes can fetch a working token on a cold, no-users-yet database (Decision #5).

## What Changes

- **Add user identity** — a `users` collection (`email`, `password_hash`, `name`, `created_at`), registration + login endpoints, bcrypt password hashing, and JWT-based `requireAuth` middleware that populates `req.user`. This is net-new scope; no FR in `project-ida-requirments.md` asks for login.
- **Add a `platform_credentials` collection** storing one credential per `(user_id, platform)` pair: `access_token` and `refresh_token` **encrypted at rest** (AES-256-GCM, key from env — never plaintext in Mongo), plus `expires_at`, `scopes`, `status`, and the platform-side account identity (`external_account_id`, `external_account_name`).
- **Add OAuth 2.0 connect/callback flows** for Facebook (Meta), YouTube (Google), and LinkedIn — `GET /credentials/:platform/connect` returns the provider authorize URL with a signed, single-use `state`; `GET /credentials/:platform/callback` exchanges the code for tokens and persists them encrypted against the authenticated user.
- **Add token refresh on read** — the credential resolver refreshes an expired/near-expiry token using the stored refresh token before handing it to a caller, so analytics jobs never see a stale token.
- **Add `getPlatformToken(platform, userId?)`** in `backend/src/app/lib/platformCredentials.ts` — the single accessor every analytics change imports. Resolves from the credential store, falling back to `.env` bootstrap tokens (`FB_PAGE_TOKEN`, `YOUTUBE_API_KEY`, `LINKEDIN_TOKEN`) when no stored credential exists, so downstream changes are not blocked on a manual OAuth click-through (Decision #5).
- **Add a liveness verification script** (`npm run verify:credentials`) that pings each platform's API with the resolved token and reports PASS/FAIL per platform — same "verify, don't assume" discipline `backend-scaffold` and `db-vector-indexes` established.
- **Keep the LinkedIn-delayed fallback** — per `project-ida-requirments.md` §5.6, LinkedIn approval may not arrive before demo; a missing/unapproved LinkedIn credential must degrade to "connected but pending approval", never crash the app or block Facebook/YouTube.

## Capabilities

### New Capabilities
- `user-auth`: user registration, login, bcrypt password hashing, and JWT `requireAuth` middleware — the identity layer the per-user credential store requires.
- `platform-credentials`: encrypted per-user OAuth credential storage for Meta / YouTube / LinkedIn, with connect/callback flows, refresh-on-read, a single `getPlatformToken()` resolver for downstream analytics changes, and live credential verification.

### Modified Capabilities
_(none — `backend-scaffold`, `db-vector-indexes`, and `api-contract-openapi` requirements are unchanged; this change is additive on top of all three)_

## Impact

- **New**: `backend/src/app/modules/User/**` (model, service, controller, route, validation), `backend/src/app/modules/PlatformCredential/**` (same 6-file module shape), `backend/src/app/middleware/auth.ts` (`requireAuth`), `backend/src/app/lib/crypto.ts` (AES-256-GCM encrypt/decrypt), `backend/src/app/lib/platformCredentials.ts` (`getPlatformToken` resolver + refresh), `backend/src/app/lib/oauthProviders.ts` (per-provider authorize/token/refresh/identity config), `backend/src/scripts/verifyPlatformCredentials.ts`, `backend/.env.example`
- **Modified**: `backend/src/app/config/index.ts` (JWT secret, credential encryption key, 3 OAuth client id/secret pairs, 3 bootstrap tokens, OAuth redirect base URL), `backend/src/app/routes/index.ts` (mount `/auth` + `/credentials`), `backend/src/app/docs/**` (OpenAPI paths/schemas for the new endpoints — `api-contract-openapi` is merged and must stay accurate), `backend/package.json` (`jsonwebtoken`, `bcrypt` deps + `verify:credentials` script)
- **Downstream unblocked**: `facebook-analytics`, `youtube-analytics`, `linkedin-analytics` (all Robayat) — each imports `getPlatformToken()` rather than reading `process.env` directly
- **External dependency (unchanged, still blocking)**: Mursalin (page admin, not on the dev team) must create the Meta app + page token, the YouTube API key, and submit the LinkedIn app. **LinkedIn approval takes 2–3 days — submit today.** OAuth client credentials for all three providers now also come from him.
- **No breaking changes** to existing routes — purely additive. Existing `/api/v1` resource endpoints remain unauthenticated (Decision #6).
- **Deviation from plan**: adds an auth surface and a DB-backed credential store where `MASTER-PLAN.md` scoped only `.env` values. Reviewers should push back here if the added scope threatens the July 16 deadline.
