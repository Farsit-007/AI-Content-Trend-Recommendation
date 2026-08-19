# Growth Studio — Production Hardening Plan

> 23 improvements to features that already exist and work. Nothing here is a new capability — it is
> the gap between "demoed successfully" and "runs unattended for a year." Every item was verified
> against the code on `main`.

**Scope:** backend + frontend, no new features · **Verified:** 2026-08-20 · **Ref commit:** `ec9f1a7`

| Tier | Count | Theme |
|------|:-----:|-------|
| **P0** | 5 | Broken or exposed in production |
| **P1** | 6 | Features that quietly return the wrong thing |
| **P2** | 4 | Works now, degrades with volume |
| **P3** | 4 | Frontend |
| **P4** | 4 | Operational polish |

> **If you only do one thing this week:** P0-1 and P0-2. A user who forgets their password currently
> cannot recover their account, and there is no rate limit standing between a scripted client and
> your provider credits.

---

## Implementation status

**21 of 23 done, 1 partial, 1 blocked on you.** Branch `chore/production-hardening`. Backend: typecheck
clean, lint 0 errors, 561/571 tests passing. Frontend: **27 tests passing**, lint 0 errors, build clean.

Only `P4-3` is outstanding, and it cannot be done from here — see the flag register below.

| Item | Status |
|------|--------|
| P0-1 password reset | **Done** — `lib/mailer.ts`, SMTP config; needs `SMTP_*` set to actually deliver |
| P0-2 rate limiting | **Done** — three Redis-backed tiers + `trust proxy` |
| P0-3 ingestion lock | **Done** — Redis lock, 409 on the manual trigger |
| P0-4 CI | **Done** — `.github/workflows/ci.yml`; test step is soft-gated, see below |
| P0-5 committed secrets | **Partly** — `env.example` scrubbed. **You must still rotate all four leaked values**; they remain in git history |
| P1-1 chat pool ordering | **Done** |
| P1-2 per-team relevance | **Done** — `news_item_team_scores`, in-database team-ranked feed + auto-gen, backfill script |
| P1-3 regex escaping | **Done** — escaping shipped. The `$text` index migration is deferred: it changes search from substring to word matching, which is a UX decision |
| P1-4 filter/sort allowlists | **Done** — plus `query parser` pinned explicitly |
| P1-5 pagination clamp | **Done** |
| P1-6 builder cleanup | **Done** — also fixed the dead `-createdAt` default sort |
| P2-1 vector-search migration | **Done, scope narrowed** — chat migrated behind `CHAT_VECTOR_SEARCH_ENABLED` with in-memory fallback. Dedup and brand-voice retrieval deliberately **not** migrated; see below |
| P2-2 compound indexes | **Done** — three added; still worth an `explain()` against production data |
| P2-3 categorization cap | **Done** — deferred items are stored with `needs_review`, and counted in `ingestion_runs.categorization` |
| P2-4 generation over SSE | **Done** — `POST /content/generate/stream`, one event per completed format, cancellation stops the remaining paid calls |
| P3-1 code splitting | **Done** — every page is its own chunk |
| P3-2 error boundary | **Done** — per-route boundary + router `errorElement` |
| P3-3 streaming | **Done** — token streaming on `POST /chat/stream`; adapters gained `streamChatCompletion` for all three providers |
| P3-4 frontend tests | **Done** — Vitest + Testing Library, 27 tests, a hard gate in CI from day one |
| P4-1 key-reveal audit | **Done** — `llm.key_revealed` action |
| P4-2 `default_models` validation | **Done** — see correction below |
| P4-3 flag decisions | **Blocked on you** — needs live provider runs. See the register below |
| P4-4 error tracking | **Done** — Sentry behind `SENTRY_DSN`/`VITE_SENTRY_DSN`, no-op unset; frontend SDK lazy-loaded so it costs nothing when off |

### Two corrections to this plan, found while implementing

**P4-2 was half wrong.** Request validation *already* rejected unknown task keys —
`z.record(llmTaskEnum, objectId)` enforces the enum. The real gap was referential: nothing checked
that the ObjectId *values* pointed at a model that exists, is active, and has the capability the task
needs. That check now runs in `updateTeam`.

**P0-4 uncovered pre-existing test debt.** `backend/.env.test` is referenced by the Jest setup but was
never committed, so the suite silently fell through to the real `backend/.env` and three suites failed
72/72. With a committed `.env.test`, 30 tests failed; 20 of those were fixable test bugs and are now
fixed:

- `mapWithConcurrency` lived in `newsIngestion.contentFetch.ts` and was imported by
  `newsIngestion.metaEnrichment.ts`, so any test mocking the former stubbed it out from under the
  latter — `enrichMetadata` returned `undefined` and the pipeline handed `undefined` to Layer 4, nine
  tests failing several steps from the cause. Moved to `lib/concurrency.ts`.
- `createTestTeam` left `voice_profile.default_language` on the schema's `bangla` default while
  nearly every canned response is English, so the language guard fired a second, unasserted LLM call
  on every generation. Fixture now defaults to English; Bangla tests already pass it explicitly.
- Four style-pack authorization tests asserted a **super_admin** gets 403 on super-admin-only routes
  — an artifact of the `admin` role removal mechanically rewriting `role: 'admin'` to
  `role: 'super_admin'`. They now assert the regular-user case.
- The backend ESLint config enabled the TypeScript-unaware base `no-unused-vars` and `no-undef`
  alongside their typescript-eslint equivalents, so every unused variable reported twice and
  built-in types like `RequestInit` read as undefined globals. 25 lint errors → 0.

### P2-1's original ordering in this plan was wrong

This plan said to migrate "largest pool first: dedup's recent pool, then chat, then brand-voice
retrieval." That ordering was by pool size, not by whether migrating actually helps:

- **Dedup should not migrate.** It compares each candidate against stored items *and against the
  other candidates in the same run*, which are not in the index yet. `$vectorSearch` can only serve
  the first half, so the result is a hybrid of N per-candidate Atlas queries plus the in-memory
  comparison it was meant to replace — more round trips and more moving parts than the single bulk
  load it started as.
- **Brand-voice retrieval is not worth it.** A team's pool is 25-30 vectors — one small query either
  way. The original `brand-voice-rag` design note already reached this conclusion.
- **Chat was the real win**, and it does more than save the ~6 MB of embeddings each request
  transferred: the in-memory path truncates to `CHAT_CONTEXT_POOL_CAP` *before* relevance is
  considered, so past the cap the best-matching item may simply not be in the slice that was loaded.
  Ordering that cap by trend score (P1-1) made the truncation principled; searching the whole corpus
  and truncating after removes it. This is the proper fix P1-1 could only approximate.

### Feature flag register — P4-3

Four ready-but-off flags now exist. Each needs a recorded verdict, then to be switched on or deleted;
a flag that is neither is a live code path every future change must keep working with no evidence it
should exist. None can be decided from a dev machine — the first two need a judgment call on real
generated output, the last two need the target Atlas cluster.

| Flag | How to decide | Criterion |
|---|---|---|
| `CONTENT_CRITIQUE_ENABLED` | `npm run verify:bangla-bakeoff -- --critique both` | Does the critique pass measurably improve Bangla output enough to justify one extra LLM call per eligible format? |
| `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` | `npm run verify:style-pack-retrieval`, then `npm run migrate:style-example-embeddings` if adopting | Gate G1 — does topic-summary embedding retrieve better Bangla style examples than content embedding? |
| `NEWS_FEED_SEMANTIC_MATCH_ENABLED` | `npm run db:verify-indexes` | Does `news_items_vector_index` exist on the target cluster? |
| `CHAT_VECTOR_SEARCH_ENABLED` | `npm run db:create-indexes` then `npm run db:verify-indexes` | Same index, and it must declare `lifecycle` + `created_at` as **filter fields**. An index created before this change does not — `db:create-indexes` now warns rather than reporting a clean skip. |

### The 10 remaining test failures need a decision, not a fix

Nine assert that `DEFAULT_FORMATS` is `['facebook_post', 'linkedin_post']`; the code says
`['facebook_post']`. Flipping it takes the suite from 10 failures to 1 — but it also doubles the LLM
calls of every generate request that omits `formats`, so it is a product and cost decision. **Pick
one and make the other match.** The tenth is `contentGeneration.bakeoff.ts`'s prompt-fidelity test:
the harness's assembled prompt has drifted from a live request's.

Until both are settled, the CI test step carries `continue-on-error: true`. Remove it once they are —
a permanently-soft gate stops meaning anything.

---

## P0 — Broken or exposed in production

### P0-1 · Password reset does nothing in production
**Severity:** broken · **Effort:** ~4h · `backend/src/app/modules/User/user.service.ts:170`

- **Now** — `forgotPassword` mints a valid 15-minute reset token, writes it to the log, and returns it
  **only when `NODE_ENV !== 'production'`**. There is no mail transport in the backend at all.
- **Impact** — Since accounts are admin-created and there is no self-registration, a locked-out user
  has no recovery path except someone reading server logs. The `/forgot-password` page ships to
  production and silently does nothing.
- **Fix** — Add a transactional mail sender behind a small `lib/mailer.ts`, gated on config so it
  no-ops in tests.

### P0-2 · No rate limiting anywhere on the API
**Severity:** exposed · **Effort:** ~3h · `backend/src/app.ts`, auth/content/chat routes

- **Now** — No rate-limit middleware is installed. `helmet` and CORS are the only protections in front
  of every route.
- **Impact** — Two distinct risks. **Auth:** `/auth/login` and `/auth/forgot-password` are unlimited,
  so passwords are brute-forceable and reset tokens can be farmed. **Money:** `/content/generate`
  fires up to five sequential LLM calls per request and `/chat` one more, both against real provider
  keys, with no per-team ceiling.
- **Fix** — Three tiers of `express-rate-limit` backed by the Redis you already run: strict on auth
  (by IP), moderate global (by user id), and a separate daily generation quota per team.

### P0-3 · Ingestion is the only job without a concurrency lock
**Severity:** cost · **Effort:** ~2h · `newsIngestion.service.ts:runIngestionPipeline`

- **Now** — Engagement refresh and retention both open with `redis.set(LOCK_KEY, …, 'PX', ttl, 'NX')`.
  `runIngestionPipeline` has no equivalent, despite being the most expensive job and the only one
  with a manual trigger.
- **Impact** — A super admin hitting *Run ingestion* while the 3-hour cron is mid-flight runs the whole
  pipeline twice concurrently: doubled embedding, adjudication and categorization spend, and two
  writers racing on `content_hash`. It also becomes a correctness problem the moment the backend runs
  more than one replica, since all four schedulers are in-process.
- **Fix** — Copy the existing lock pattern into the pipeline entry point and return a clear
  "already running" response to the manual trigger.

### P0-4 · 44 test suites that nothing runs
**Severity:** process · **Effort:** ~2h · `.github/workflows/ci.yml` (new)

- **Now** — No `.github/workflows`. The suite runs only when someone remembers to type `npm test`.
- **Impact** — Cheapest high-value item on the list. The tests are genuinely good — integration
  coverage on memory-Mongo and mocked Redis, no live services needed.
- **Fix** — One workflow on push and PR: backend `typecheck → lint → test`, frontend `lint → build`.

### P0-5 · Live credentials committed in `env.example`
**Severity:** secrets · **Effort:** ~1h + rotation · `env.example` (tracked) + git history

- **Now** — The tracked `env.example` carries a real Atlas connection string with its password, the
  Product Hunt client secret, a real `JWT_SECRET`, and a real `CREDENTIAL_ENCRYPTION_KEY`.
- **Impact** — That encryption key protects every provider API key stored in Mongo, so it is the
  highest-value secret in the system. All four are in git history, so replacing the file is not enough
  on its own.
- **Fix** — Rotate all four; replace every value with a placeholder. Rotating
  `CREDENTIAL_ENCRYPTION_KEY` requires re-encrypting stored provider keys — write that as a one-shot
  script alongside the existing `migrate:*` family.

---

## P1 — Features that quietly return the wrong thing

### P1-1 · Chat reads an arbitrary 500 items, not the best 500
**Severity:** quality · **Effort:** ~1h · `Chat/chat.retrieval.ts:fetchNewsContext`

- **Now** — Queries active items in the 7-day window and applies `.limit(CHAT_CONTEXT_POOL_CAP)` with
  **no `.sort()`**. Mongo returns them in natural order.
- **Impact** — Below 500 items this is invisible and correct. Above it — which a 7-source pipeline on a
  3-hour cadence reaches quickly — chat semantically ranks an essentially random subset. Answers get
  worse as the product gets more data, with nothing in the logs to say so.
- **Fix** — Add `.sort({ current_trend_score: -1 })` so the cap truncates the tail rather than a random
  slice. Better still, this is the clearest candidate for the unused `news_items_vector_index`.

### P1-2 · Relevance is scored against every team's voice, then used per team
**Severity:** multi-tenant correctness · **Effort:** ~2d · `newsIngestion.scoring.ts`, `newsIngestion.service.ts`

- **Now** — `fetchBrandVoicePool()` loads the embeddings of *every team's* brand-voice examples into one
  pool, and `scoreRelevance` takes the maximum similarity across all of them. The result is stored as a
  single global `relevance_score` on the shared news item.
- **Impact** — Correct for one team, wrong the moment there are two. `relevance_score` carries 40% of
  `opportunity_score` — the heaviest weight — and `opportunity_score` is what the feed sorts on and what
  the auto-generation job picks its daily drafts from. A DevOps-focused team can have its feed ordered,
  and its drafts chosen, by how well items matched a different team's voice.
- **Fix** — Move relevance out of the shared document: compute at read time against the requesting
  team's pool, or persist per-team scores in a side collection like the category overrides already do.

### P1-3 · Search builds an unescaped regex from user input
**Severity:** ReDoS · **Effort:** ~3h · `builder/QueryBuilder.ts:search`

- **Now** — Interpolates `searchTerm` straight into `{ $regex: term, $options: 'i' }` across every
  searchable field, with no escaping and no anchor.
- **Impact** — A catastrophic-backtracking pattern such as `(a+)+$` pins a database thread; unanchored
  case-insensitive regex cannot use an index either way, so ordinary searches are already full
  collection scans over `news_items`.
- **Fix** — Escape the term before interpolation, then add a Mongo text index and switch to `$text`.

### P1-4 · Every query parameter becomes a database filter
**Severity:** injection-adjacent · **Effort:** ~4h · `builder/QueryBuilder.ts:filter, sort`

- **Now** — `filter()` deletes six known keys from the query string and passes **everything remaining**
  into `.find()`. `sort()` forwards the raw user-supplied sort string to Mongo.
- **Impact** — Express 5's default `simple` query parser is currently what saves you — it does not
  expand `?field[$ne]=x` into a nested operator object. That is one `app.set('query parser', 'extended')`
  away from real operator injection, and it is not written down anywhere. Independently,
  `?sort=embedding` asks Mongo to sort 1536-dimension arrays with no index.
- **Fix** — Give each module an allowlist of filterable and sortable fields. Pin the query-parser choice
  with a comment.

### P1-5 · Pagination has no maximum page size
**Severity:** perf · **Effort:** ~30m · `builder/QueryBuilder.ts:paginate`

- **Now** — Reads `Number(query.limit) || 10` and applies it directly.
- **Impact** — `?limit=100000` returns the whole collection in one response. Feed reads are
  `optionalAuth`, so that includes anonymous callers.
- **Fix** — Clamp to a ceiling (100) inside `paginate()`.

### P1-6 · E-commerce leftovers in the shared query builder
**Severity:** cleanup · **Effort:** ~20m · `builder/QueryBuilder.ts`

- **Now** — `filter()` carries `minPrice` / `maxPrice` handling that writes an `amount` range onto the
  query. No collection in this project has an `amount` field.
- **Impact** — Template residue in the one class every module's list endpoint routes through.
- **Fix** — Delete it. Fix the `-createdAt` default sort in the same pass — no schema here uses that
  field name, which is why `getAllNewsItems` has to inject its own default first.

---

## P2 — Works now, degrades with volume

### P2-1 · Three unbounded vector pools loaded into process memory
**Severity:** scale · **Effort:** ~3d · `newsIngestion.utils.ts`, `newsIngestion.scoring.ts`, `chat.retrieval.ts`

- **Now** — Every ingestion run calls `fetchBrandVoicePool()` (all examples, all teams, no limit) and
  `fetchRecentEmbeddings()` (every item in the 72-hour window). Every chat request pulls up to 500
  documents including their embeddings — roughly 6 MB of vectors per request.
- **Impact** — Right at hackathon scale and documented as deliberate. But two Atlas vector indexes exist,
  are created by `db:create-indexes`, and are used by exactly one code path — the feed semantic tier,
  which is off by default.
- **Fix** — Migrate incrementally, largest pool first: dedup's recent pool, then chat, then brand-voice
  retrieval. Keep the pure ranking functions and swap only the fetch underneath. **Do this after P1-2**,
  which changes what relevance is scored against.

### P2-2 · The feed's real query shape has no compound index
**Severity:** perf · **Effort:** ~2h · `NewsItem/newsItem.model.ts`

- **Now** — Single-field indexes on `current_trend_score`, `category`, `category_group`, `lifecycle`. The
  feed query filters on `lifecycle` plus a `$or` over `category`/`category_group`, then sorts by
  `current_trend_score` and `created_at`.
- **Impact** — Mongo picks one index and sorts the rest in memory. Fine at current row counts, steadily
  worse — and the retention job is what has been keeping the collection small enough to hide it.
- **Fix** — `explain()` the real feed query, then add the compound index it wants.

### P2-3 · No ceiling on how many items one run can send to the LLM
**Severity:** cost · **Effort:** ~3h · `NewsIngestion/newsIngestion.categorize.ts`

- **Now** — Adjudication is capped (`NEWS_INGESTION_ADJUDICATION_MAX_BATCHES`) but categorization is not.
- **Impact** — Since the relevance storage gate was removed, every deduped fresh item reaches Layer 4. A
  source returning ten times its usual volume converts directly into ten times the spend, with no
  ceiling and no alert.
- **Fix** — Per-run item cap ordered by trend score. Log what was dropped into `ingestion_runs` — a silent
  cap would misreport as full coverage.

### P2-4 · Generation holds an HTTP request open across up to seven LLM calls
**Severity:** reliability · **Effort:** ~4d · `ContentGeneration/contentGeneration.service.ts`

- **Now** — One `POST /content/generate` for all five formats does fact extraction, one call per format,
  plus an optional critique pass per eligible format — sequentially, inside the request.
- **Impact** — Comfortably past a typical 30-second proxy timeout. A timeout at the edge loses work that
  was paid for and completed.
- **Fix** — Return a job id immediately and stream progress per format over SSE, or poll.

---

## P3 — Frontend

### P3-1 · Every user downloads the entire admin console
**Severity:** perf · **Effort:** ~2h · `frontend/src/utils/routesGenerator.ts`

- **Now** — All fifteen dashboard pages are static imports in the route arrays.
- **Impact** — A normal user never opens the admin pages, and the landing page pays for them too.
- **Fix** — `React.lazy` per route entry with a `Suspense` boundary in `routeGenerator`. Because routing
  is data-driven, this is one function rather than fifteen files.

### P3-2 · One render error blanks the whole dashboard
**Severity:** reliability · **Effort:** ~2h · `frontend/src/routes/routes.tsx`

- **Now** — No error boundary and no `errorElement` anywhere in the router tree.
- **Impact** — An unexpected shape from any endpoint takes the user to a white screen with no recovery
  except a manual reload, and you never hear about it.
- **Fix** — An `errorElement` on the dashboard route with a real recovery action, plus a boundary around
  the routed outlet so a broken page keeps the sidebar usable.

### P3-3 · Chat and generation show a spinner instead of text
**Severity:** UX · **Effort:** ~3d · `llmProvider.adapters.ts`, `Chat/chat.service.ts`, `Chat.tsx`

- **Now** — Both wait for the complete provider response before rendering anything.
- **Impact** — Chat is the worst case, against a product category where everyone expects the first token
  in under a second. The perceived-speed gain is larger than any real latency work you could do.
- **Fix** — Every provider SDK supports streaming. Add a `stream` variant to the adapter contract and
  expose it over SSE, chat first. Shares transport work with P2-4.

### P3-4 · No frontend tests at all
**Severity:** coverage · **Effort:** ~2d · `frontend/package.json`

- **Now** — No test runner. The backend has 44 suites; the frontend has zero.
- **Impact** — The riskiest frontend logic is unguarded — the axios single-flight refresh interceptor
  especially, where a regression logs everybody out.
- **Fix** — Vitest plus Testing Library. Don't chase coverage; test the refresh interceptor,
  `ProtectedRoute` role gating, `routeGenerator`, and the team-readiness empty state.

---

## P4 — Operational polish

### P4-1 · Revealing a provider API key leaves no audit trail
**Severity:** audit · **Effort:** ~1h · `llmProvider.controller.ts:revealKey`, `activityLog.model.ts`

- **Now** — `POST /llm-providers/:id/keys/:keyId/reveal` decrypts a stored key and returns it in
  plaintext. The `ActivityLogEntry` action enum has no entry for it.
- **Impact** — The single most sensitive operation in the product, and the only privileged action that is
  not recorded. Everything around it is.
- **Fix** — Add an `llm.key_revealed` action and log actor, provider, and key label on every call.

### P4-2 · Per-team model overrides are stored unvalidated
**Severity:** robustness · **Effort:** ~2h · `Team/team.model.ts`, `team.validation.ts`

- **Now** — `Team.default_models` is `Schema.Types.Mixed`.
- **Impact** — A typo in a task key means that tier silently never matches and resolution falls through
  to the global default. A configuration bug that presents as "the model setting doesn't work."
- **Fix** — Validate against `LLM_TASKS` on write and reject an unknown key rather than storing it.

### P4-3 · Three feature flags built, shipped off, never decided
**Severity:** debt · **Effort:** ~1d · `backend/src/app/config/index.ts`

- **Now** — `NEWS_FEED_SEMANTIC_MATCH_ENABLED`, `CONTENT_CRITIQUE_ENABLED`, and
  `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` are complete, default-off, and each carries a config comment
  saying not to enable it without a recorded verdict. No verdict has been recorded.
- **Impact** — Each is a live code path every future change must keep working, with no evidence it should
  exist.
- **Fix** — You already built the harnesses: `verify:bangla-bakeoff --critique both` for the critique
  pass, `db:verify-indexes` for the semantic tier. Run them, record the verdicts, then turn each flag on
  or delete it.

### P4-4 · Nothing tells you when production breaks
**Severity:** observability · **Effort:** ~4h · `middleware/globalErrorHandler.ts` + frontend boundary

- **Now** — Structured pino logs, and that is all. No error aggregation, no alerting, no metrics.
- **Impact** — Notably lopsided: *pipeline* observability is genuinely strong — `ingestion_runs` and
  `maintenance_runs` record per-source counts even on a crash — while the API serving real users has
  none. A spike in provider failovers, a wave of 500s, or a scheduler that silently stopped firing all
  look identical from outside: silence.
- **Fix** — Sentry in the global error handler and the frontend error boundary. Then an uptime check on
  `/health`, which already reports Mongo and Redis separately.

---

## Suggested sequencing

### Week 1 — Close the holes
Nothing here needs design discussion.

- All five P0 items — the mail sender is the only one over half a day
- `P1-5` pagination clamp and `P1-6` builder cleanup, since both land in the same file
- Land CI first so everything after it is guarded

### Week 2 — Fix the wrong answers
Starting with the one that gets worse as you grow.

- `P1-1` chat pool ordering — one line, immediate quality win
- `P1-2` per-team relevance — the largest correctness item, and a prerequisite for P2-1
- `P1-3` and `P1-4` query hardening
- `P3-1` and `P3-2` in parallel on the frontend — both half-day changes with visible payoff

### Week 3+ — Scale work and streaming
Once the foundation underneath is correct.

- `P2-4` and `P3-3` together — one SSE transport serves both
- `P2-1` vector-search migration, dedup pool first
- `P2-2` and `P2-3`, then the P4 items as filler
- `P4-3`: decide the three flags before they outlive the reasoning behind them

---

Everything above was verified against the working tree — file paths and references are real, and no
item is speculative. What is *not* here is new features: this list assumes the product is the right
product and only asks whether it survives contact with a year of production traffic.
