## Context

`backend-scaffold` and `db-vector-indexes` are merged; `api-contract-openapi` (PR #12) is merged and serves a live OpenAPI 3.1 contract at `/api/v1/docs`. The backend today has three feature modules (`NewsItem`, `PlatformPost`, `BrandVoiceExample`), each following a strict 6-file MVC shape (`*.interface.ts`, `*.model.ts`, `*.service.ts`, `*.controller.ts`, `*.route.ts`, `*.validation.ts`, plus `*.utils.ts` for searchable fields), wired through `backend/src/app/routes/index.ts`. There is **no user identity of any kind** — no User model, no auth middleware, no `jsonwebtoken`/`bcrypt` in `package.json`, no session handling. `cookie-parser` is installed and mounted but unused.

`backend/src/app/config/index.ts` exposes only `node_env`, `port`, `web_url`, `database_url`, `redis_url`, and the OpenRouter/embedding keys — read via plain `process.env.*` with no validation, so a missing secret currently surfaces as `undefined` at call time rather than at boot.

**Scope deviation.** `MASTER-PLAN.md:49` / `SPEC-DRIVEN-WORKFLOW.md:136` / `ROBAYAT.md:20` scope this change as app-owned tokens in `.env`. The owner has instead chosen a per-user OAuth credential store, which forces an authentication layer into the same change. This design accepts that decision and focuses on (a) doing it safely — tokens must never sit in Mongo in plaintext — and (b) not letting it block the three analytics changes that depend on this one (Decision #5). The deviation is called out in the proposal so it surfaces in PR review before `facebook-analytics` is built on top of it.

## Goals / Non-Goals

**Goals:**
- Per-user, DB-backed OAuth credentials for Meta / YouTube / LinkedIn, with tokens encrypted at rest
- A minimal but real auth layer (register / login / JWT `requireAuth`) — enough to own a credential, not a full account-management product
- **Keep `facebook-analytics` / `youtube-analytics` / `linkedin-analytics` unblocked** — they must be able to get a working token from a cold database with zero users (Decision #5)
- Fail fast at boot on missing/invalid secrets, instead of `undefined` blowing up mid-request
- Preserve the LinkedIn-pending degradation path from `project-ida-requirments.md` §5.6 — a missing LinkedIn credential must never take down Facebook/YouTube analytics or the app
- Keep the OpenAPI contract accurate — `api-contract-openapi` is merged and Mehedi builds against it

**Non-Goals:**
- Password reset, email verification, refresh-token rotation for *app* sessions, RBAC/roles, or account deletion — out of scope for a hackathon; a JWT with a sane TTL is enough
- Retrofitting `requireAuth` onto the existing `/news-items`, `/platform-posts`, `/brand-voice-examples` endpoints — that would break Mehedi's frontend and Robayat's stub-server contract mid-hackathon (Decision #6)
- A frontend login/connect UI — Mehedi owns `frontend/`; this change ships the API and OpenAPI contract only
- Actually *calling* the Meta/YouTube/LinkedIn analytics endpoints — that's `facebook-analytics` / `youtube-analytics` / `linkedin-analytics`; this change only proves a token authenticates (Decision #7)
- Multi-tenant data isolation on analytics results — `platform_analytics` rows are not scoped per user in this change

## Decisions

### 1. Token encryption at rest: AES-256-GCM, key from env
OAuth access/refresh tokens are bearer credentials to a real company's social accounts — storing them plaintext in Atlas means anyone with a read-only DB URI owns the accounts. `backend/src/app/lib/crypto.ts` exposes `encrypt(plaintext): string` / `decrypt(ciphertext): string` using Node's built-in `crypto` (`aes-256-gcm`, random 12-byte IV per encryption, auth tag appended). Stored format is a single self-describing string: `v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>` — versioned so the scheme can be rotated later without a migration guess. Key is `CREDENTIAL_ENCRYPTION_KEY`, a 32-byte value supplied base64/hex in env, validated at boot (Decision #4). GCM (not CBC) so tampering is detected on decrypt rather than yielding garbage plaintext. No new dependency — Node stdlib only.

**The token fields are `select: false` on the Mongoose schema** and stripped in a `toJSON` transform, so a careless `res.json(credential)` in a future change cannot leak them. Decryption happens only inside `platformCredentials.ts`.

### 2. Auth: JWT bearer + bcrypt, no sessions
`bcrypt` (cost 10) for password hashing; `jsonwebtoken` HS256 signed with `JWT_SECRET`, TTL from `JWT_EXPIRES_IN` (default `7d`). `requireAuth` middleware (`backend/src/app/middleware/auth.ts`) reads `Authorization: Bearer <token>`, verifies, loads the user, and attaches `req.user = { id, email }` via an Express `Request` type augmentation. It throws the existing `AppError(httpStatus.UNAUTHORIZED, ...)` so it flows through the already-merged `globalErrorHandler` with no special-casing. Chosen over cookie sessions because the frontend is a separate Next.js origin and a bearer token avoids a cross-site cookie/CORS fight during a hackathon — `cookie-parser` stays unused.

`password_hash` is `select: false`; login explicitly re-selects it.

### 3. OAuth: a provider table, not three bespoke flows
The three providers differ only in URLs, scopes, and the shape of their token/identity responses. `backend/src/app/lib/oauthProviders.ts` holds one record per platform — `authorizeUrl`, `tokenUrl`, `scopes`, `clientId`/`clientSecret` (from config), plus `parseToken(resp)` and `fetchIdentity(accessToken)` adapters — so the controller/service is a single generic flow (`connect` → `callback`) rather than three near-duplicate copies.

Provider specifics that actually matter:
- **Facebook/Meta**: short-lived user token must be exchanged for a **long-lived page token** (`grant_type=fb_exchange_token`, then `/me/accounts` to get the page token). Scopes per §5.6: `pages_read_engagement`, `pages_show_list`, `read_insights`. Page tokens derived this way are long-lived and effectively non-expiring, so `refresh_token` is null and `expires_at` is far-future.
- **YouTube/Google**: standard OAuth 2.0 with `access_type=offline&prompt=consent` to actually receive a `refresh_token` (Google omits it otherwise on re-consent). Access tokens expire in ~1h — this is the provider that makes refresh-on-read (Decision #4) load-bearing.
- **LinkedIn**: scopes `r_organization_social`, `r_basicprofile` per §5.6. **May not be approved before demo.**

`state` is a JWT signed with `JWT_SECRET` carrying `{ userId, platform, nonce }` and a 10-minute TTL, verified on callback — this is the CSRF defense for the OAuth flow and also how the callback knows which user to attach the credential to (the callback is a provider redirect and carries no `Authorization` header). Single-use is enforced by storing the nonce in Redis (already wired via `lib/redis.ts`) and deleting it on consumption.

### 4. Refresh-on-read, inside the resolver
Callers must never think about expiry. `getPlatformToken()` checks `expires_at`; if the token is expired or within a 5-minute skew window, it refreshes via the provider's `tokenUrl` using the stored refresh token, re-encrypts, and persists — then returns the fresh access token. A refresh failure marks the credential `status: 'needs_reauth'` and throws, so the analytics change gets a clear, actionable error instead of a silent 401 from the platform. No background refresh worker/cron — refresh-on-read is strictly simpler, needs no scheduler, and a 6h analytics refresh cycle (FR-06) hits the resolver often enough that lazy refresh is sufficient.

### 5. `getPlatformToken()` with `.env` bootstrap fallback — this is what keeps the critical path alive
**The most important decision in this change.** A purely per-user store means: no user has signed up → no credential row → `facebook-analytics` cannot run at all. That would make this Day-1 foundation change *block* the three analytics changes it exists to unblock, and gate them on a manual browser click-through.

So the single accessor every downstream change imports is:

```ts
getPlatformToken(platform: 'facebook' | 'youtube' | 'linkedin', userId?: string): Promise<string>
```

Resolution order:
1. If `userId` is given → that user's stored credential (refreshed per Decision #4).
2. Else → the **workspace default credential**: the single most-recently-connected active credential for that platform (in a one-company hackathon demo there will be exactly one).
3. Else → the `.env` bootstrap token (`FB_PAGE_TOKEN` / `YOUTUBE_API_KEY` / `LINKEDIN_TOKEN`) — the tokens Mursalin generates by hand, exactly as the original plan intended.
4. Else → throw `AppError(FAILED_DEPENDENCY, "<platform> not connected")`, which the analytics changes surface as "connected but pending approval" for LinkedIn (§5.6 fallback) rather than a 500.

This means the analytics changes work **the moment Mursalin's tokens land in `.env`**, with or without anyone completing an OAuth flow — the OAuth store is a strict upgrade layered on top, not a prerequisite. YouTube's `YOUTUBE_API_KEY` is an API key, not an OAuth token, and is returned as-is at step 3 (its analytics endpoints accept it), so the YouTube path never needs OAuth for the demo.

### 6. Existing endpoints stay unauthenticated
`requireAuth` guards only `/credentials/**` (and `/auth/me`). The existing `/news-items`, `/platform-posts`, `/brand-voice-examples` routes stay open. Locking them now would break Mehedi's frontend and the stub-server contract that `api-contract-openapi` (merged, PR #12) already published, mid-hackathon, for no demo benefit. Noted explicitly so it's a conscious deferral, not an oversight — a later `secure-existing-endpoints` change can close this.

### 7. Verification proves *authentication*, not analytics
`backend/src/scripts/verifyPlatformCredentials.ts` resolves a token per platform via `getPlatformToken()` and makes one cheap, read-only identity call — Meta `/me?fields=id,name`, YouTube `channels?part=id&mine=true` (or an API-key `channels` lookup), LinkedIn `/me` — reporting `PASS`/`FAIL`/`SKIP (not configured)` per platform. It deliberately does **not** hit the insights/analytics endpoints: those belong to the analytics changes, and the only question this change must answer is "does this credential authenticate?". A `SKIP` for LinkedIn is a pass condition for the change, per §5.6.

### 8. Config: validate at boot, fail fast
`config/index.ts` currently reads raw `process.env` with no validation. This change adds a `zod` schema (zod is already a dependency) over the env, parsed once at import: required infra + `JWT_SECRET` + `CREDENTIAL_ENCRYPTION_KEY` (asserted to decode to exactly 32 bytes) fail the boot with a readable message; **all platform OAuth/bootstrap values are optional** — a hackathon dev without LinkedIn approval must still be able to start the server. Config gains a nested `platforms` shape (`facebook`/`youtube`/`linkedin` → `clientId`, `clientSecret`, `bootstrapToken`) and `oauth_redirect_base_url`.

## Risks / Trade-offs

- **[Risk] Scope.** This is materially larger than the planned `.env` change (2 new modules + auth + crypto + OAuth vs. ~10 lines of config), landing on a July 16 deadline, and it blocks three analytics changes → **Mitigation**: Decision #5 decouples them — the analytics changes only need `.env` tokens + the `getPlatformToken()` accessor, both of which land in tasks §1–2. If auth/OAuth (§4–6) runs long, it can be cut or deferred without blocking `facebook-analytics`. **Tasks are ordered so the critical path ships first.**
- **[Risk] Encryption key handling.** A lost `CREDENTIAL_ENCRYPTION_KEY` makes every stored credential permanently undecryptable; a leaked one plus DB read access means full account compromise → **Mitigation**: key is env-only (never committed, `.env.example` carries a placeholder + a generation command), the format is versioned for rotation, and credentials can always be re-connected via OAuth since they're derived, not primary, data.
- **[Risk] Auth is net-new and unscoped.** Rolling your own auth is where hackathon projects get owned → **Mitigation**: kept deliberately tiny (bcrypt + HS256 JWT, no reset/verification flows), no custom crypto anywhere (Node stdlib + bcrypt), secrets never returned by the API (`select: false` + `toJSON` strip). No FR depends on it, so it is cuttable.
- **[Risk] OAuth redirect URIs must be registered per-provider and must match exactly**, and localhost callbacks are awkward for Meta/LinkedIn → **Mitigation**: `OAUTH_REDIRECT_BASE_URL` is configurable so the same code works for `localhost:3001` in dev and the deployed Vercel URL in demo; `.env.example` documents the exact callback URL to register with each provider.
- **[Risk] LinkedIn approval may never arrive** → **Mitigation**: every layer treats a missing LinkedIn credential as `SKIP`/`needs_setup`, never fatal (Decisions #5, #7); §5.6's "connected but pending approval" demo path is preserved.
- **[Trade-off] Refresh-on-read** adds latency to the first analytics call after expiry and can double-refresh under concurrency → accepted; a Redis lock or a refresh worker is over-engineering at this scale, and a duplicate refresh is harmless for all three providers.

## Migration Plan

Ordered so the **critical path (unblocking analytics) ships before the optional OAuth layer**:

1. Config + `.env.example`: zod-validated env, `platforms` shape, bootstrap tokens, encryption key, JWT secret (Decision #8)
2. `lib/crypto.ts` + `lib/platformCredentials.ts` with `getPlatformToken()` incl. the `.env` fallback path (Decision #5) — **at this point `facebook-analytics` / `youtube-analytics` / `linkedin-analytics` are unblocked**
3. `scripts/verifyPlatformCredentials.ts` + `npm run verify:credentials`; run live against Mursalin's tokens, record PASS/FAIL/SKIP per platform (Decision #7)
4. `User` module + `requireAuth` middleware + `jsonwebtoken`/`bcrypt` deps (Decision #2)
5. `PlatformCredential` module + `oauthProviders.ts` + connect/callback flows + refresh-on-read (Decisions #1, #3, #4)
6. Extend the merged OpenAPI contract (`docs/paths.ts`, `docs/schemas.ts`, `docs/components.ts` — bearer security scheme) with `/auth/**` and `/credentials/**`
7. `cd backend && npm run typecheck && npm run lint`; verify Swagger UI still renders at `/api/v1/docs`

Rollback: additive only — no existing collection, route, or behavior is modified. Steps 4–6 can be dropped wholesale without affecting steps 1–3 or any downstream analytics change.

## Open Questions

- **Does Mursalin have OAuth client credentials, or only tokens?** The original plan only asked him for *tokens* (`FB_PAGE_TOKEN` etc.). Per-user OAuth additionally needs a **client id + client secret** per provider, with our callback URL registered on each app. If he can only produce tokens, the OAuth layer (tasks §4–6) cannot be completed and this change degrades to exactly the originally-planned `.env` scope — which Decision #5 ensures still fully unblocks the analytics work. **Confirm with Mursalin before starting task §5.**
- Where does the demo deploy from? `OAUTH_REDIRECT_BASE_URL` must be registered with all three providers ahead of time; a late-changing Vercel URL breaks OAuth at demo time (`backend/vercel.json` exists, so a URL likely already does).
- Should analytics results eventually be scoped per user (multi-tenant), now that credentials are? Not needed for the demo — flagged so `cross-platform-report` doesn't accidentally assume single-tenant forever.
