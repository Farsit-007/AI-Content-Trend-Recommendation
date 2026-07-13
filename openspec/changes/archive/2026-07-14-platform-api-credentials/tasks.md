> ## ⚠️ ARCHIVED INCOMPLETE — 2026-07-14
>
> Archived at 26/51 tasks, by explicit decision, **not** because the change finished.
>
> **Shipped and live-verified (§1–4):** zod-validated fail-fast config, AES-256-GCM token
> encryption (`lib/crypto.ts`), the `getPlatformToken()` resolver with `.env` bootstrap fallback
> (`lib/platformCredentials.ts`), the `verify:credentials` script, and the full auth layer
> (`modules/User/` + `middleware/auth.ts`, 13/13 live checks green).
> **This is enough to unblock `facebook-analytics` / `youtube-analytics` / `linkedin-analytics`** —
> they import `getPlatformToken()` and will resolve real tokens as soon as Mursalin's values
> reach `.env`, with no further code change.
>
> **NOT built (§5–7):** the per-user OAuth credential store — `PlatformCredential` module,
> `oauthProviders.ts`, connect/callback flows, refresh-on-read, `/credentials` endpoints, and the
> OpenAPI additions. Blocked on task 0.3: nobody has confirmed whether Mursalin can supply OAuth
> **client id + secret** per provider (the original plan only ever asked him for *tokens*).
>
> **Delta specs were deliberately NOT synced to `openspec/specs/`.** `specs/platform-credentials/`
> describes OAuth connect/callback/refresh/listing behavior that does not exist in the codebase;
> syncing it would have made the main specs assert untrue things. `specs/user-auth/` *is* accurate
> and could be synced on its own if wanted.
>
> To finish this work, start a fresh change for §5–7 rather than un-archiving this one.

> **Task order is deliberate.** §0–3 are the critical path — they unblock `facebook-analytics`, `youtube-analytics`, and `linkedin-analytics` using `.env` tokens alone (design Decision #5). §4–7 add the per-user OAuth layer on top and can be cut or deferred without blocking any downstream change. Do not start §4 until §3 is verified green.

## 0. External dependency — do this FIRST (blocks everything)

- [ ] 0.1 Ping **Mursalin** (page admin, not on the dev team) for: Meta long-lived **page** token + page id, YouTube Data API v3 key + channel id, LinkedIn app access
- [ ] 0.2 **Submit the LinkedIn app today** — approval takes 2–3 days and may not arrive before demo (`project-ida-requirments.md` §5.6)
- [ ] 0.3 **Ask Mursalin whether he can provide OAuth client id + secret per provider, not just tokens** — this is the open question in design.md. Per-user OAuth (§5–6) is impossible without client credentials; if he can only supply tokens, stop after §3 and this change degrades cleanly to the originally-planned `.env` scope
- [ ] 0.4 Update the API Credentials Tracker table in `ROBAYAT.md` as each token/app lands

## 1. Config + env validation

- [x] 1.1 Rewrite `backend/src/app/config/index.ts` to parse `process.env` through a `zod` schema once at import (zod is already a dependency), failing boot with a readable message — replaces the current unvalidated `process.env.*` reads. All pre-existing config keys kept identical, so `verifyConnections`/`redis`/`llmClient`/`embeddings` imports are unaffected
- [x] 1.2 Required (boot fails if missing): existing infra vars + `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` (assert it decodes to exactly **32 bytes**, per design Decision #1) — accepts base64 *or* hex, whichever `openssl rand` produced
- [x] 1.3 Optional (must never block boot — a dev without LinkedIn approval still has to run the server): `FB_PAGE_TOKEN`, `FB_PAGE_ID`, `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`, `LINKEDIN_TOKEN`, `LINKEDIN_ORG_ID`, the 3 OAuth `*_CLIENT_ID`/`*_CLIENT_SECRET` pairs, `OAUTH_REDIRECT_BASE_URL`, `JWT_EXPIRES_IN`
- [x] 1.4 Expose a nested `platforms: { facebook, youtube, linkedin }` config shape (`clientId`, `clientSecret`, `bootstrapToken`, account id) so no downstream code reads `process.env` directly
- [x] 1.5 Create `backend/.env.example` — every var above with placeholder values, **no real secrets**, plus a one-liner to generate the encryption key (`openssl rand -base64 32`) and the exact callback URL to register with each provider
- [x] 1.6 Confirm `.env` is gitignored and no secret is staged — verified: `.env` is ignored by both root and `backend/.gitignore`; `git status` shows only source files. **Generated real `JWT_SECRET` + `CREDENTIAL_ENCRYPTION_KEY` into the local (gitignored) `backend/.env`** so the server still boots now that 1.2 makes them required

## 2. Crypto + credential resolver — unblocks the analytics changes

- [x] 2.1 Create `backend/src/app/lib/crypto.ts` — `encrypt`/`decrypt` via Node stdlib `crypto`, AES-256-GCM, random 12-byte IV per call, auth tag appended; stored format `v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>` (versioned for rotation). No new dependency
- [x] 2.2 Round-trip test: encrypt → decrypt returns the original; flipping a byte of ciphertext or auth tag **throws** rather than returning garbage — **verified live**, all 4 properties: `is ciphertext: true` (plaintext absent from output), `round-trip: true`, `unique IV: true` (same input encrypts differently each call), `tamper: rejected (throws)`
- [x] 2.3 Create `backend/src/app/lib/platformCredentials.ts` exporting `getPlatformToken(platform, userId?)` — the single accessor all analytics changes import instead of reading `process.env`. Also exports `isPlatformConfigured()` and the `Platform` type
- [x] 2.4 Implement resolution order per design Decision #5: user's stored credential → most-recent active credential for the platform → **`.env` bootstrap token** → `AppError(FAILED_DEPENDENCY, '<platform> not connected')`. In §2 only steps 3–4 exist (no credential collection yet); steps 1–2 get wired in §5.5 — the `userId` param is already in the signature so downstream imports don't have to change later
- [x] 2.5 Verify the "not connected" error is a typed `AppError` that flows through the merged `globalErrorHandler` — so LinkedIn-pending renders as "connected but pending approval", never an unhandled 500 or an `undefined` token sent to a platform API
- [x] 2.6 `cd backend && npm run typecheck` passes

## 3. Live credential verification (do not skip — "verify, don't assume")

- [x] 3.1 Create `backend/src/scripts/verifyPlatformCredentials.ts` — for each platform resolve a token via `getPlatformToken()` and make **one cheap read-only identity call**: Meta `/me?fields=id,name`, YouTube `channels?part=id`, LinkedIn `/me`. Do **not** call insights/analytics endpoints — those belong to the analytics changes (design Decision #7)
- [x] 3.2 Report `PASS` / `FAIL` (token present but rejected — surface the provider's error) / `SKIP` (nothing configured) per platform. A `SKIP` must not fail the run or block the other two platforms
- [x] 3.3 Add `verify:credentials` to `backend/package.json` scripts (mirroring the existing `db:verify-indexes` pattern)
- [~] 3.4 **Run it live** — ran, but **cannot fully pass yet: Mursalin's tokens do not exist**, so `.env` has no platform values. Current live result is `SKIP / SKIP / SKIP`, exit 0 (the correct "nothing configured yet" state).
      **The FAIL path was force-tested against the real provider APIs** with deliberately bogus tokens, to prove the script cannot false-PASS:
      - `FAIL facebook — HTTP 400 {"message":"Invalid OAuth access token...","type":"OAuthException","code":190}` (real response from Meta Graph API)
      - `FAIL youtube  — HTTP 400 {"message":"API key not valid...","reason":"API_KEY_INVALID"}` (real response from Google)
      - `SKIP linkedin` — correctly did not block the other two; exit code 1 on failure
      **Re-run this task once Mursalin delivers tokens; PASS is the only branch still unproven.**
- [x] 3.5 ✅ **Checkpoint — the code path is done: `facebook-analytics` / `youtube-analytics` / `linkedin-analytics` can now import `getPlatformToken()` and start.** They will resolve real tokens the moment Mursalin's values land in `.env` — no code change needed at that point. Everything below is the optional OAuth upgrade layer

## 4. Auth layer (net-new scope — see proposal's deviation note)

- [x] 4.1 `cd backend && npm i jsonwebtoken bcrypt && npm i -D @types/jsonwebtoken @types/bcrypt` — `bcrypt` is a native module but built cleanly on Windows, so no need to fall back to `bcryptjs`
- [x] 4.2 Create `backend/src/app/modules/User/` following the existing 6-file module shape (`user.interface.ts`, `user.model.ts`, `user.validation.ts`, `user.service.ts`, `user.controller.ts`, `user.route.ts`) — copy the conventions from `modules/PlatformPost/`, incl. `catchAsync` + `sendResponse` + `AppError`
- [x] 4.3 `user.model.ts`: `email` (unique, lowercase, trimmed), `password_hash` (**`select: false`**), `name`, `created_at`; `toJSON` transform strips `password_hash`
- [x] 4.4 `POST /auth/register` — zod-validated via the existing `validation` middleware (note: it validates `{ body, cookies }`), bcrypt cost 10, `409` on duplicate email, returns the user without its hash
- [x] 4.5 `POST /auth/login` — re-select `password_hash` explicitly, `bcrypt.compare`, return an HS256 JWT signed with `JWT_SECRET` / `JWT_EXPIRES_IN`. **Identical `401` message for unknown-email and wrong-password** (no user enumeration)
- [x] 4.6 Create `backend/src/app/middleware/auth.ts` — `requireAuth`: parse `Authorization: Bearer`, verify JWT, load user, attach `req.user = { id, email }`; throw `AppError(httpStatus.UNAUTHORIZED)` on missing/malformed/expired/bad-signature so it flows through the merged `globalErrorHandler`. Also re-checks that the user still exists, since a JWT can outlive the account it names
- [x] 4.7 Augment the Express `Request` type with `user?: { id: string; email: string }` (declaration merging in `src/types/express.d.ts`) so `req.user` typechecks.
      ⚠️ **Gotcha worth knowing:** `tsc --noEmit` passed but **`ts-node` did not** — ts-node only loads files reachable from the entrypoint, so it skipped the unimported `.d.ts` and `req.user` failed to compile at runtime. `npm run dev` and every `ts-node` script would have broken while typecheck stayed green. Fixed by adding `"ts-node": { "files": true }` to `backend/tsconfig.json`
- [x] 4.8 `GET /auth/me` (guarded) returns the current user
- [x] 4.9 Mount `/auth` in `backend/src/app/routes/index.ts` `moduleRoutes`
- [x] 4.10 **Confirm the existing `/news-items`, `/platform-posts`, `/brand-voice-examples` routes are still unauthenticated** (design Decision #6) — locking them would break Mehedi's frontend and the published `api-contract-openapi` contract — **verified live**, see the smoke run below

**§4 verified live** — real HTTP against the real Express stack (Atlas-connected), 13/13 green:
`register 201` · `no password_hash in response` · `password stored as bcrypt hash, never plaintext` · `duplicate email → 409` · `bad email + weak password → 400` · `wrong password → 401` · `unknown email → 401` · **`no user enumeration — identical "Invalid email or password" both ways`** · `login → 200 + JWT` · `/auth/me + valid token → user` · `/auth/me no token → 401` · `/auth/me bad token → 401` · **`/news-items still 200 unauthenticated (contract intact)`**

## 5. PlatformCredential module + OAuth flows

- [ ] 5.1 Create `backend/src/app/lib/oauthProviders.ts` — one record per platform (`authorizeUrl`, `tokenUrl`, `scopes`, `clientId`/`clientSecret` from config, `parseToken()`, `fetchIdentity()`), so the flow is written **once** generically rather than three times (design Decision #3)
- [ ] 5.2 Provider specifics that will bite if missed: **Facebook** — exchange the short-lived user token for a **long-lived page token** (`grant_type=fb_exchange_token` → `/me/accounts`), scopes `pages_read_engagement`, `pages_show_list`, `read_insights`. **Google/YouTube** — `access_type=offline&prompt=consent` or no `refresh_token` is returned. **LinkedIn** — `r_organization_social`, `r_basicprofile`
- [ ] 5.3 Create `backend/src/app/modules/PlatformCredential/` (same 6-file shape). Model: `user_id`, `platform`, `access_token` + `refresh_token` (**encrypted at rest via `lib/crypto.ts`, both `select: false`**), `expires_at`, `scopes`, `status`, `external_account_id`, `external_account_name`, `connected_at`; **compound unique index on `{ user_id, platform }`**; `toJSON` strips both token fields
- [ ] 5.4 `GET /credentials/:platform/connect` (guarded) → provider authorize URL with a `state` JWT (`{ userId, platform, nonce }`, 10-min TTL) whose nonce is stored in Redis via the existing `lib/redis.ts`. `GET /credentials/:platform/callback` → verify + **consume** the nonce (single-use), exchange code, resolve identity, upsert the encrypted credential. Reject missing/expired/tampered/replayed `state` without writing anything
- [ ] 5.5 Wire resolution steps 1–2 of `getPlatformToken()` (§2.4) to actually read this collection now that it exists, keeping the `.env` fallback intact below them
- [ ] 5.6 Implement refresh-on-read in `platformCredentials.ts`: if `expires_at` is past or within a 5-min skew and a refresh token exists → refresh, re-encrypt, persist, return the new token. On refresh rejection → set `status: 'needs_reauth'` and throw an actionable error (never return a stale token)
- [ ] 5.7 `GET /credentials` (list — status only, **no token material**) and `DELETE /credentials/:platform` (scoped to `req.user.id` only — a user must not be able to delete anyone else's credential)
- [ ] 5.8 Mount `/credentials` in `routes/index.ts`
- [ ] 5.9 **Verify tokens are ciphertext in the DB**: connect a real account, then read the raw document straight from Atlas and confirm `access_token` is `v1:...` ciphertext and the plaintext token appears nowhere in the document

## 6. OpenAPI contract (keep the merged contract accurate)

- [ ] 6.1 Add a `bearerAuth` security scheme to `backend/src/app/docs/components.ts`
- [ ] 6.2 Add schemas to `docs/schemas.ts`: `User`, `RegisterRequest`, `LoginRequest`, `LoginResponse`, `PlatformCredential` (**token fields absent by construction**)
- [ ] 6.3 Add paths to `docs/paths.ts`: `/auth/register`, `/auth/login`, `/auth/me`, `/credentials`, `/credentials/{platform}/connect`, `/credentials/{platform}/callback`, `/credentials/{platform}` (DELETE) — guarded ops marked with `bearerAuth`
- [ ] 6.4 Confirm Swagger UI still renders at `/api/v1/docs` and `/api/v1/openapi.json` still validates — `api-contract-openapi` (PR #12, merged) is what Mehedi builds against; breaking it breaks him

## 7. Final checks

- [ ] 7.1 `cd backend && npm run typecheck` passes
- [ ] 7.2 `cd backend && npm run lint` passes
- [ ] 7.3 `npm run verify:credentials` re-run green (LinkedIn `SKIP` acceptable)
- [ ] 7.4 End-to-end smoke: register → login → connect a real platform → `GET /credentials` shows it active with no token material → `getPlatformToken()` returns a working token → disconnect
- [ ] 7.5 Boot the server with `CREDENTIAL_ENCRYPTION_KEY` and `JWT_SECRET` **unset** and confirm it fails fast with a readable config error (not an `undefined` crash mid-request)
- [ ] 7.6 `git diff` for secrets — no real token, key, or client secret anywhere in tracked files, including `.env.example`
- [ ] 7.7 **In the PR description, call out the scope deviation explicitly**: `MASTER-PLAN.md:49` scoped this as "tokens → `.env`"; this ships per-user OAuth + an auth layer on top. Note that §0–3 alone fully unblock the three analytics changes, so reviewers can judge whether §4–6 is worth the deadline risk
- [ ] 7.8 Update `MASTER-PLAN.md:49` + `ROBAYAT.md:20` status rows and the API Credentials Tracker table
