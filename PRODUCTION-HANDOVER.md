# Growth Studio — Production Handover

**Prepared:** 2026-08-22 · **Verified against:** working tree on `main` (commit `e7eb31a` + uncommitted work)

Everything below was verified by running it or probing the live systems. Where something could not be
verified from this machine, it says so explicitly rather than assuming.

---

## 1. Live topology (verified)

| Piece | URL | Status when checked |
|---|---|---|
| Frontend | `https://growth-studio-sepia.vercel.app` | **200** — up (Vercel) |
| Backend API | `https://growth-studio.nextlevelhq.xyz/api/v1` | **200** on `/api/v1/openapi.json` |
| Backend health | `https://growth-studio.nextlevelhq.xyz/health` | `{"status":"ok","mongo":"up","redis":"up","uptime_seconds":65746}` |
| Edge | Cloudflare (`Server: cloudflare`, HSTS `max-age=31536000`) | active |
| Database | MongoDB Atlas (`cluster0.xuultiq.mongodb.net`) | reachable from the deployed backend |

**The API host in `frontend/.env` is wrong.** The commented-out line reads
`growthstudio.nextlevelhq.xyz` (no hyphen) — that domain **does not resolve** (`NXDOMAIN`). The
deployed bundle actually calls `https://growth-studio.nextlevelhq.xyz/api/v1` (hyphenated). Fix the
comment before anyone uses it to configure an environment.

---

## 2. Verification status (all run on this machine)

| Check | Command | Result |
|---|---|---|
| Backend types | `cd backend && npm run typecheck` | **clean** |
| Backend lint | `cd backend && npm run lint` | **0 errors** (185 warnings, mostly `no-console` in `src/scripts/`) |
| Backend tests | `cd backend && npm test` | **580 / 580 passing, 50 suites** |
| Frontend types | `cd frontend && npx tsc -b` | **clean** |
| Frontend lint | `cd frontend && npm run lint` | **0 errors** (1 warning: `react-hooks/incompatible-library` in `VoiceProfileSection.tsx`) |
| Frontend tests | `cd frontend && npm test` | **27 / 27 passing** |
| Frontend build | `cd frontend && npm run build` | **succeeds**; largest chunk 480 kB (151 kB gzip) |

The backend suite previously had **10 long-standing failures**. They are now fixed — see §6.

---

## 3. P0 — must be resolved before this is a healthy production system

### P0-A · Ingestion has stored 0 items for 13+ hours (the feed and catalog are empty)

**Evidence.** The last five cron runs (06:00, 09:00, 12:00, 15:00, 18:00) each stored **0** items and
recorded:

> `No LLM provider is configured for task "embedding" — add a provider, API key, and model in the admin LLM settings (and optionally set a global task default).`

The three runs before those stored 37, 48 and 29 items normally, so this started roughly 13–15 hours
before the check. The admin UI reports the one provider (`nextlebel`, openrouter) as enabled with
**1 of 2 keys active** — consistent with a key having been deactivated.

**Why it fails.** `lib/modelResolution.ts` resolves a model in four tiers — request → team → global
→ bootstrap. `LlmNotConfiguredError` is thrown **only when every tier falls through**, which means
both of these are true:

1. no global task default for `embedding` pointing at an active, embedding-capable model on an active
   provider that has an active key, **and**
2. no bootstrap `OPENROUTER_API_KEY` in the environment (confirmed absent from `backend/.env`).

**This is in the shared database, not one machine's `.env`.** The failing runs span 13 hours while
the local backend had only been up 1.6 hours, so the production instance (18 h uptime) wrote most of
them. Both instances read the same Atlas cluster.

**Fix (either one works; the first is the intended production path):**

- **In-app:** Dashboard → **AI Providers** → *Task defaults* tab → set **Embeddings** to an
  embedding-capable model. If no such model is listed, first add one under *Manage models* on the
  provider — `openai/text-embedding-3-small` (1536-dim, the dimension every vector index is built
  for), with the `embedding` capability checked — and confirm the provider has an **active** key.
- **Bootstrap fallback:** set `OPENROUTER_API_KEY` in the backend environment. `EMBEDDING_MODEL`
  already defaults to `openai/text-embedding-3-small`.

**Do not change the embedding model's dimension.** Every Atlas vector index is built for 1536; a
different model silently breaks dedup, chat retrieval and brand-voice RAG.

**Verify the fix:** Pipeline → *Run ingestion now*, then confirm the new run's Result column says OK
and `total_stored > 0`.

### P0-B · Rate limiting collapses to a single shared bucket behind Cloudflare

`TRUST_PROXY_HOPS` is **unset**, so it defaults to `0` (`config/index.ts:77`) and
`app.set('trust proxy', …)` is never called (`app.ts:26`). Production sits behind Cloudflare
(verified). Express therefore keys every limiter on the **proxy's** IP, so all users share one bucket:
one busy client can lock everyone out of `/auth/login`, and the per-IP protection the plan's P0-2
shipped is effectively inert.

The code's own comment states the risk in both directions — too low and everyone shares a bucket, too
high and a client can spoof `X-Forwarded-For` for a fresh bucket per request.

**Fix:** set `TRUST_PROXY_HOPS` to the real number of proxies in front of Node.
- Cloudflare → Node directly: `1`
- Cloudflare → nginx/Caddy → Node: `2`

Confirm which applies on the host, then verify: send a few requests and check that the rate-limit
counters key on distinct client IPs rather than one.

### P0-C · Leaked credentials are still in git history (carried over, still open)

`IMPROVEMENT-PLAN.md` P0-5 records that `env.example` was scrubbed but **four leaked values remain in
git history and were never rotated**. I confirmed the current tree is clean — no `.env` is tracked
(`.env`, `backend/.env`, `frontend/.env` are all ignored), and the only committed env file,
`backend/.env.test`, contains documented throwaway placeholders. History is a separate matter and
rewriting it does not un-leak anything.

**Rotate all four now if it has not been done:** the Atlas database password, the OpenRouter API key,
`JWT_SECRET` / `JWT_REFRESH_SECRET` (rotating these invalidates existing sessions — expect everyone to
be logged out), and the Cloudinary secret. Rotation is the fix; history rewriting is optional cleanup.

### P0-D · Password reset silently does nothing in production

`SMTP_HOST` is unset, so `lib/mailer.ts` reports itself unconfigured and no mail is sent. Accounts are
admin-created with no self-registration, so a locked-out user has **no recovery path** — and
`/forgot-password` ships to production and appears to work. Set the `SMTP_*` values, or remove the
route from the UI until they exist.

### P0-E · No error tracking in production

`SENTRY_DSN` is unset, so the Sentry integration (plan P4-4) is a no-op on both ends. Nothing reports
a 500 except the container's own logs. Set `SENTRY_DSN` (backend) and `VITE_SENTRY_DSN` (frontend) or
accept that production failures are invisible.

### P0-F · The entire UI overhaul is uncommitted and undeployed

73 files are modified/untracked in the working tree, including the whole dashboard rework, the shared
primitive layer, and the backend fixes described in §6. **None of it is in git, so none of it is on
Vercel.** The live site still runs the pre-overhaul UI. Commit and deploy, or the work is not handed
over at all.

---

## 4. Environment variables

`backend/.env` is the source of truth and is **already** `NODE_ENV=production` with
`WEB_URL=https://growth-studio-sepia.vercel.app`. `env.example` has drifted (58 keys vs the 37 in use)
— treat it as documentation, not a template.

Present and correct: `NODE_ENV`, `PORT=5000`, `WEB_URL`, `LOG_LEVEL=info`,
`NEWS_INGESTION_CRON=0 */3 * * *`, `DATABASE_URL`, `REDIS_URL`, `JWT_*`,
`CREDENTIAL_ENCRYPTION_KEY` (44 chars — correct for 32 base64 bytes), `CLOUDINARY_*`, `SMTP_EMAIL` /
`SMTP_PASSWORD`, `GITHUB_TOKEN`.

Missing or empty, with the consequence of each:

| Variable | Consequence today |
|---|---|
| `TRUST_PROXY_HOPS` | P0-B — rate limiting shares one bucket |
| `OPENROUTER_API_KEY` | P0-A — no bootstrap tier, so a DB misconfiguration has no fallback |
| `SMTP_HOST` (+ port/secure) | P0-D — password reset sends nothing (`SMTP_EMAIL`/`PASSWORD` alone are not enough) |
| `SENTRY_DSN` | P0-E — no error tracking |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Only needed if you add those provider types in-app |
| `RATE_LIMIT_ENABLED` | Unset is fine — defaults to `true` |
| `LLM_MAX_KEY_ATTEMPTS` / `LLM_KEY_COOLDOWN_*` | Unset is fine — multi-key failover defaults to 3 attempts, 60 s default cooldown, 900 s ceiling |

Frontend (Vercel project env): `VITE_API_URL` must be
`https://growth-studio.nextlevelhq.xyz/api/v1`. Optional: `VITE_SENTRY_DSN`, `VITE_DEFAULT_TEAM_ID`.

---

## 5. Deploy and operate

**Frontend (Vercel).** `cd frontend && npm ci && npm run build` → `dist/`. Vercel builds on push;
`VITE_*` values must be set in the Vercel project, not in a committed file — they are inlined at
build time, so changing one requires a rebuild, not just a restart.

**Backend.** `cd backend && npm ci && npm run build && npm start` (`tsc` → `dist/`, then
`node dist/server.js`). Note the committed `Dockerfile` is **development-shaped** — it runs
`ts-node-dev --respawn` and `docker-compose.yml` sets `NODE_ENV: development` with a bind mount. Do
not deploy that compose file as-is; production should run the compiled `dist/`.

**Database, once per cluster.** `npm run db:create-indexes`, then `npm run db:verify-indexes`. The
vector index must declare `lifecycle` and `created_at` as **filter fields** — an index created before
that change does not, and `db:create-indexes` now warns instead of reporting a clean skip.

**Scheduled jobs** (`node-cron`, in-process — they run in every instance you start, so two instances
means two schedulers against one database):

| Job | Schedule | Lock |
|---|---|---|
| News ingestion | every 3 h (`0 */3 * * *`) | Redis lock; manual trigger returns 409 while held |
| Engagement refresh | hourly | Redis lock |
| Retention | 6-hourly | Redis lock |

**Health probe.** `GET /health` → 200 `ok`, or 503 `degraded` with per-dependency `mongo`/`redis`
status. It is excluded from request logging and from the rate limiter, so it is safe to poll.

**Four feature flags are shipped but undecided** (plan P4-3). Each is currently off. A flag that is
neither on nor deleted is a code path every future change must keep working with no evidence it
should exist:

| Flag | How to decide |
|---|---|
| `CONTENT_CRITIQUE_ENABLED` | `npm run verify:bangla-bakeoff -- --critique both` |
| `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` | `npm run verify:style-pack-retrieval` |
| `NEWS_FEED_SEMANTIC_MATCH_ENABLED` | `npm run db:verify-indexes` |
| `CHAT_VECTOR_SEARCH_ENABLED` | `npm run db:create-indexes` then `db:verify-indexes` |

---

## 6. Changes made in this handover pass

**Backend — the 10 long-standing test failures are fixed (571/571 now pass).**
`IMPROVEMENT-PLAN.md` recorded these as "needs a decision, not a fix": nine asserted
`DEFAULT_FORMATS` was `['facebook_post', 'linkedin_post']` while the code says `['facebook_post']`.

The **code was authoritative** — `contentGeneration.service.ts:230` documents the single-format
default deliberately, and the frontend matches it. Flipping the code instead would have doubled the
LLM spend of every generate request that omits `formats`. So the tests were aligned to the code,
preserving current cost:

- the one test genuinely *about* the default now asserts a single format and exactly one LLM call;
- the eight that are about multi-format behaviour (concurrency, platform-matched style sets,
  per-format directives, fact-sheet injection) now request `['facebook_post','linkedin_post']`
  **explicitly**, so they keep testing what they are named for regardless of the default;
- the auto-generation job test asserts the single format the job actually produces.

The tenth was real drift: the bake-off prompt-parity test compared an **English** live request
against the harness's **Bangla** default (`runBakeoffMatrix` defaults `language: 'bangla'`). The live
request is now pinned to the same language — parity is only meaningful for like-for-like inputs.

**If you would rather ship two default formats,** change `DEFAULT_FORMATS` in
`backend/src/app/modules/ContentGeneration/contentGeneration.formats.ts:67` **and**
`frontend/src/lib/api/content.ts`, and revert the first test above. It is a cost decision, not a
correctness one.

**Backend — multi-key provider failover.** A provider can hold several API keys; resolution now
rotates across them and remembers which ones are resting. This replaces a single retry that always
started at `keys[0]`, retried once, retried on *any* error, and remembered nothing — so a third key
was unreachable, a rate-limited key was re-tried on every subsequent request, and a malformed
request burned two billable calls to prove the same failure twice.

- `lib/llmErrors.ts` — classifies provider errors. 429 reads `Retry-After` / `X-RateLimit-Reset`;
  402/401/403 cool the key down hard; 5xx and timeouts fail over without blaming the key; **400/404
  do not fail over at all**, since they fail identically on every key.
- `lib/llmKeyHealth.ts` — Redis-backed cooldowns (`llm:key:cd:*`), a round-robin rotation counter,
  and 24h failure counters. Every function degrades open: if Redis is down, resolution falls back to
  today's fixed key order rather than turning a cache outage into an LLM outage.
- `lib/modelResolution.ts` — one candidate pool across all tiers (deduplicated, rotated, cooling
  keys last), tried in order up to `LLM_MAX_KEY_ATTEMPTS`. Covers generation, chat, streaming,
  categorization, adjudication, embeddings, style cards, facts and critique, because every
  production call site already routed through here.
- Adapter `maxRetries` dropped from 1 to **0** — an SDK-level retry re-sends to the *same*
  rate-limited key, doubling the latency and quota damage of every 429 before failover gets a turn.
- Key cooldowns and 24h failure counts are exposed on `GET /llm-providers` and rendered in the admin
  keys panel, so a resting key is visible rather than silent.

**A latent bug fixed along the way:** streaming failover never worked. Adapter
`streamChatCompletion`s are async generators, so calling one returned a generator object without
executing its body — a connect-time 429 surfaced only when the caller iterated, well past the
try/catch meant to catch it. The first chunk is now pulled inside the failover loop, which is what
makes "fail over before the first token, never mid-stream" actually true.

Nine tests in `src/__tests__/llmKeyFailover.test.ts` cover rotation spread, cooldown skip,
`Retry-After` expiry, all-keys-resting degradation, no-failover-on-400, 5xx not penalising a key,
the attempt cap, and both streaming rules.

**Frontend — dashboard overhaul** (uncommitted, see P0-F): a shared primitive layer
(`components/ui/`, 15 new files incl. a TanStack-Table-v9 `data-table`), `PageHeader` / `FormDialog` /
`ConfirmDialog`, and every dashboard page reworked to table + modal patterns. Deeper API integration:
`?lifecycle=` on news items, `?job=engagement_refresh` maintenance runs (that data was previously
unreachable in the UI), and `page`/`limit` on `/generated-content` and `/activity-log`. All five
remaining native `<select>` elements were replaced. A ⌘K command palette derives its entries from the
same role-based route config as the sidebar.

One bug was found and fixed during that work: the catalog sent `?lifecycle=active` unconditionally,
but the backend treats an explicit value as an **exact match** (`newsItem.service.ts:98`), which hides
every document ingested before the field existed. Omitting the param is what means "not archived".

---

## 7. Known gaps (deliberate, not oversights)

- **No CI.** The workflow was built and working, then deleted at the owner's request (plan P0-4).
  Nothing runs either suite automatically; `npm test` in each package still works.
- **Users are create-and-read only.** There is no `PATCH`/`DELETE /users/:id`, so the admin UI offers
  no row-level edit or delete. Role changes happen per team from Team settings. The UI states this
  rather than showing buttons that would 404.
- **Bulk draft approve/dismiss is a client-side fan-out** over the single-item `PATCH` — there is no
  bulk endpoint. It uses `allSettled`, so partial failure reports both counts.
- **Sorting is client-side within the loaded page** for every list except `/news-items` — only that
  endpoint accepts a `sort` param.
- **Dedup and brand-voice retrieval were deliberately not migrated to `$vectorSearch`** (plan P2-1);
  the reasoning is recorded there and remains valid.
- **375 px mobile layout is implemented but not visually verified** — the DataTable falls back to a
  card list below `md`, but the browser tool could not actually resize the window to confirm it.
- `$text` index migration for search is deferred: it changes substring matching to word matching,
  which is a UX decision.

## 8. Rollback

Frontend: redeploy the previous Vercel deployment (instant, no data implications). Backend: redeploy
the prior image/commit — no migration runs on boot, so there is nothing to reverse. Index creation is
additive and safe to leave. Rotating `JWT_*` is the only change that forcibly logs everyone out.
