# Plan: Growth Studio — Production-Grade Upgrade

**Mode**: conversational (free-form request)
**Baseline**: `main` @ `0e48f76`, working tree clean
**Complexity**: Large — 8 independently shippable phases, ~77 h total
**Decisions**: settled — see §9 (backend stays split · hard team scope + labeled fallback · no CI/CD · phase-wise)

---

## 1. Requirements restatement

| # | Ask (as given) | What it means concretely |
|---|---|---|
| R1 | "chat must be team-specific… jei team er chat o sudhu sei team er info janbe" | Chat **retrieval** must be scoped to the team, not just chat *access*. Today access is scoped; the knowledge is global. |
| R2 | "our db data er upor base kore answer dibe" | Chat should answer from the team's whole DB footprint (news + drafts + brand voice + settings), not news alone. |
| R3 | "optimize chat token" | Real token accounting, prompt caching, context budgeting, history compaction, input caps. |
| R4 | "Claude, ChatGPT, Gemini interface and backend mechanism" | Chat UI parity (markdown, citations, stop, regenerate, edit-resend, cost meter) + a caching/streaming backend shaped like theirs. |
| R5 | "generate route, draft route now separate; if possible make it same route" | Unify the two dashboard pages into one Studio surface. |
| R6 | "optimize rag, and redis checing" | Turn Redis from a lock store into a real cache layer; decide and land the three dormant vector-search flags. |
| R7 | "improve rag data feed… make it easy and engaging" | Feed IA: explainability, digest, saved views, one-click generate. |
| R8 | "specific admin, and other role" | `team_admin` currently gets the identical UI to `member`. Give each tier a real surface. |
| R9 | "prod grade useable system not pet project" | Close the open P0s, add cost/usage observability, restore CI. |

---

## 2. Grounding — what the code actually does today

Verified by reading the files, not inferred.

### The headline defect (R1)

`chat.retrieval.ts:68` — `fetchNewsContext(questionEmbedding)` **takes no team id**.

```ts
// chat.retrieval.ts:96 — the in-memory path
const items = await NewsItem.find(
  { lifecycle: 'active', created_at: { $gte: since } },   // <- global, every team's pool
  { title:1, snippet:1, content:1, category:1, ... }
).sort({ current_trend_score: -1, created_at: -1 }).limit(config.chat.context_pool_cap);
```

```ts
// chat.vectorRetrieval.ts:47 — the $vectorSearch path, same story
filter: { lifecycle: 'active', created_at: { $gte: since } }
```

Meanwhile the **feed** already does the right thing (`newsItem.service.ts:110-127`): it loads
`team.subscribed_categories` and filters `$or: [{category: {$in: …}}, {category_group: {$in: …}}]`.

So: chat access control is correct (`chat.service.ts:16` `assertTeamAccess`, and history reads filter
on `team_id` inside the query), but **chat's knowledge is the global corpus**. Two teams asking the
same question get the same context. That is exactly the complaint.

Chat also never reads: the team's own drafts (`generated_content`), its brand-voice examples, its
subscriptions, its style pack, its per-team scores (`news_item_team_scores`), or its category
overrides — all of which exist in the DB and are what R2 asks for.

### Token & cost (R3)

| Finding | Evidence |
|---|---|
| **Zero token accounting.** No adapter reads `usage` off the provider response. | `grep usage\|prompt_tokens` across `llmClient.ts`, `modelResolution.ts`, all three adapters → only `max_tokens` in the Anthropic adapter |
| **No `max_tokens`** on the OpenAI and OpenRouter paths | `llmProvider.adapters.openai.ts`, `.openrouter.ts` |
| **No input length cap on chat** — `message: z.string().min(1)` with no `.max()` | `chat.validation.ts:8` |
| **Context is inside the system message**, so the prompt prefix changes every turn → provider prompt caching is structurally impossible | `chat.prompt.ts:26` — `` `${buildSystemPrompt(...)}\n\nContext:\n${formatContext(context)}` `` |
| **History is 10 raw messages**, no summarization, no token budget | `chat.retrieval.ts:10` `HISTORY_LIMIT = 10` |
| **Every question is embedded fresh** — `contentGeneration.embedCache.ts` exists and caches topic embeddings in Redis; chat does not use it | `chat.service.ts:59` |
| Rate limiting is **request-count only** (200/team/day), not token- or cost-based | `config/index.ts` `RATE_LIMIT_LLM_MAX`, `middleware/rateLimit.ts:76` |

### Redis (R6)

Total current usage — 12 files, all of it locks and counters:

- LLM key cooldowns / rotation (`llmKeyHealth.ts`)
- rate-limit store (`rateLimit.ts`)
- topic-embedding cache + fact-sheet cache — **content generation only** (`contentGeneration.embedCache.ts`, `.facts.ts`)
- ProductHunt OAuth token (`adapters/producthunt.ts`)
- three job locks (ingestion / refresh / retention)

Not cached, and hit on essentially every request: `isTeamReady()` (2 DB round-trips —
`team.service.ts:87`), the team document + `subscribed_categories`, `resolveVoiceOptions`, model
resolution (DB lookups per LLM call), style packs, feed page 1, chat retrieval.

There is no cache-aside helper, no key namespace, no stampede protection, and no hit/miss metric.

### Generate vs Drafts (R5)

- Frontend: `/dashboard/generate` (`Generate.tsx`, 299 lines) and `/dashboard/drafts`
  (`Drafts.tsx`, 520 lines) — two sidebar entries, two mental models.
- Backend: `ContentGenerationRoutes` (`POST /content/generate`, `/generate/stream`, `/refine`) and
  `GeneratedContentRoutes` (`GET/POST/PATCH /generated-content`, `POST /run` super-admin only).
- **The real bug hiding in the split:** streamed output lives only in React state
  (`Generate.tsx:87` `setEditor`) until the user clicks *Save draft*. A tab close, a navigation, or a
  proxy hiccup discards content that was already paid for.

### Roles (R8)

- Global tiers: `super_admin | user` (`user.interface.ts:3`). Team tier: `team_admin | member`
  (`team.interface.ts:41`).
- `getDashboardPaths(role)` (`routes/index.ts`) returns `supperAdminPaths` for super_admin and
  `userPaths` for **everyone else** — so a `team_admin` sees byte-identical navigation to a plain
  member. `admin.routes.tsx` exists but is a dead middle tier consumed only by `supperAdmin.routes.tsx`.
- The backend already has `requireTeamAdmin` and uses it. The capability exists; the UI ignores it.
- File is misspelled: `supperAdmin.routes.tsx`.
- No `PATCH`/`DELETE /users/:id` — users are create-and-read-only (handover §7).

### Production floor (R9) — still open, verified against `backend/.env`

| Var | State | Consequence |
|---|---|---|
| `TRUST_PROXY_HOPS` | unset → `0` | Behind Cloudflare every limiter shares **one bucket**; one client can lock out `/auth/login` for everyone |
| `SENTRY_DSN` | unset | No error tracking; 500s are invisible |
| `SMTP_HOST` | unset | Password reset silently does nothing; no recovery path (no self-registration) |
| `OPENROUTER_API_KEY` | unset | No bootstrap tier — a DB misconfiguration takes ingestion to zero (this already happened for 13 h) |
| `CHAT_VECTOR_SEARCH_ENABLED` | unset → off | Chat ranks a truncated 500-doc pool in Node (~6 MB of floats per question) |
| `NEWS_FEED_SEMANTIC_MATCH_ENABLED` | unset → off | Undecided flag |

Handover P0-F (uncommitted UI) is **resolved** — tree is clean, the DataTable work is committed at
`0e48f76`. Not re-planned here.

---

## 3. Patterns to mirror

| Category | Source | Pattern to follow |
|---|---|---|
| Module layout | `modules/Chat/` | `*.interface / .model / .validation / .route / .controller / .service` + focused helpers (`.retrieval`, `.prompt`, `.vectorRetrieval`) |
| Cache-aside | `contentGeneration.embedCache.ts:22-28` | `redis.get` → parse → miss → compute → `redis.setex` with a named TTL const |
| Degrade-open | `lib/llmKeyHealth.ts` | Every Redis call wrapped; a cache outage must never become a feature outage |
| Vector search | `chat.vectorRetrieval.ts` | Isolated module (memory-server can't run `$vectorSearch`), caller try/catches and falls back |
| Feature flags | `config/index.ts` | Env-driven, off by default, with a comment naming the verify script that decides it |
| Errors | `errors/AppError.ts` + `catchAsync` | `throw new AppError(httpStatus.X, msg)`; SSE routes bypass `catchAsync` deliberately (`chat.controller.ts:52`) |
| Team scoping | `newsItem.service.ts:110-127` | Filter is part of the **query**, never a post-fetch check |
| Tests | `src/__tests__/*.integration.test.ts` + `support/{db,fixtures,openrouterMock,redisMock}.ts` | mongodb-memory-server + mocked OpenRouter |
| Frontend routing | `routes/*.routes.tsx` → `routeGenerator` / `sidebarItemsGenerator` | Add a page = one `TUserPath` array entry |
| Frontend data | `@tanstack/react-query` + one thin file per domain in `lib/api/` | |

---

## 4. Phased implementation

### Phase 0 — Production floor (config only, no code) · ~2 h · **do first**

Nothing below is "production grade" while these are open.

1. Set `TRUST_PROXY_HOPS` (1 if Cloudflare→Node, 2 if Cloudflare→nginx→Node). Verify limiter keys on distinct client IPs.
2. Set `SENTRY_DSN` + `VITE_SENTRY_DSN` (the integration is already shipped and is a no-op without them).
3. Set `SMTP_HOST`/`PORT`/`SECURE`, **or** hide `/forgot-password` until they exist.
4. Set `OPENROUTER_API_KEY` as the bootstrap fallback tier.
5. Rotate the four leaked credentials if not already done (Atlas password, OpenRouter key, `JWT_*`, Cloudinary secret). Rotating `JWT_*` logs everyone out — schedule it.
6. Confirm the `embedding` task default resolves; run ingestion and assert `total_stored > 0`.

**Validate:** `curl -s $API/health` → `{"status":"ok","mongo":"up","redis":"up"}`; one manual ingestion run stores > 0.

---

### Phase 1 — Team-scoped chat · ~14 h · **the headline change**

> **STATUS: code complete.** 1.1–1.4 and 1.6 shipped; **1.5 is blocked on an operator step** (see
> below). Backend 594/594 across 51 suites (was 580/50), frontend 27/27, both typecheck clean,
> backend lint 0 errors / 185 warnings (unchanged baseline), frontend build succeeds.
>
> | Item | State |
> |---|---|
> | 1.1 Thread team context into retrieval | done — `chat.teamContext.ts`, `fetchNewsContext(embedding, teamContext)` |
> | 1.2 Apply the feed's scoping rule + tier ladder | done — `buildNewsScopeTiers` in `chat.retrieval.ts` |
> | 1.3 Four-source team corpus + RRF | done — `chat.corpus.ts` |
> | 1.4 Grounding contract, citations, tier labels | done — `chat.prompt.ts`, surfaced via `context_tier`/`sources` + SSE `context` event |
> | 1.5 Enable `$vectorSearch` | **blocked** — needs `db:create-indexes` against the live Atlas cluster; the index must be dropped and recreated to pick up the new `category`/`category_group` filter fields. Operator action, not a code change. |
> | 1.6 Leakage tests | done — `__tests__/chat.teamScope.test.ts`, 13 cases |

**Goal:** a team's chat can only ever see that team's world.

**1.1 Thread team context into retrieval.**
Change the signature to `fetchNewsContext(questionEmbedding, teamContext)` where
`TeamContext = { teamId, subscribedCategories, stylePackId?, language }`. Both call sites
(`chat.service.ts:66` and `:158`) already have `payload.team_id`.

**1.2 Apply the feed's own scoping rule to chat.**
Reuse the exact predicate from `newsItem.service.ts:118`:
`$or: [{category: {$in: subs}}, {category_group: {$in: subs}}]`, plus `lifecycle: 'active'` and the
recency window. Add the same fields as `$vectorSearch` **filter** fields so the vector path scopes
identically — a filter applied after the vector limit would spend the limit on other teams' items.

**1.3 Build a real team corpus** (this is R2 — "answer from our DB data"). New
`chat.corpus.ts` fanning out over four scoped retrievers, run in parallel:

| Retriever | Collection | Scope key | Why |
|---|---|---|---|
| `news` | `news_items` | subscription filter + per-team scores from `news_item_team_scores` | what's trending *for this team* |
| `drafts` | `generated_content` | `{ team_id }` | "what have we written about X?", "show my approved LinkedIn posts" |
| `voice` | `brand_voice_examples` | `{ team_id }` | "does this match our voice?" |
| `profile` | `teams` doc | `_id` | subscriptions, custom instructions, default language, style pack — cheap, always included, small |

Fuse with **Reciprocal Rank Fusion** over the per-retriever ranked lists rather than comparing raw
cosine scores across heterogeneous sources (their scales are not commensurate). Tag every context
item with its `source` so the prompt can cite it.

**1.4 Grounding contract.** Rewrite `chat.prompt.ts`:
- number every context block and require `[n]` citations in the answer;
- explicitly instruct: *if the answer is not in the context, say you don't have it in this team's
  data* — no general-knowledge fallback (that is what makes the isolation user-visible, not just
  technically true);
- keep `NOT_READY_GUIDANCE` behaviour unchanged.

**1.5 Land `$vectorSearch`.** Run `npm run db:create-indexes` then `db:verify-indexes`, confirm
`lifecycle`, `created_at` **and the new category filter fields** are declared, then set
`CHAT_VECTOR_SEARCH_ENABLED=true`. This is also a token/latency win: it stops shipping ~6 MB of
embeddings into Node per question.

**1.6 Leakage tests — the acceptance gate.** New `chat.teamScope.test.ts`:
- two teams, disjoint subscriptions, distinct news items → team A's context contains **zero** of
  team B's items (assert on the returned context, not just the reply text);
- team A's drafts never appear for team B;
- a `conversation_id` from team B returns empty for team A (already true — lock it in);
- a super_admin querying team A gets team A's scope, not the global pool.

**Files:** `chat.retrieval.ts` (U), `chat.vectorRetrieval.ts` (U), `chat.corpus.ts` (C),
`chat.prompt.ts` (U), `chat.service.ts` (U), `chat.interface.ts` (U),
`scripts/createVectorIndexes.ts` (U), `__tests__/chat.teamScope.test.ts` (C).

---

### Phase 2 — Token & cost engineering · ~12 h

**2.1 Capture usage.** — **DONE.** Every adapter returns `{ content|vector|vectors, usage }`;
streaming reports via an `onUsage` callback (a generator can't return usage alongside its yields),
with `stream_options: { include_usage: true }` on the OpenAI-shaped providers and
`message_start` + `message_delta` merged for Anthropic. `modelResolution.ts` unwraps and meters all
four call sites; its public signatures are unchanged.

New `LlmUsage` module: `llm_usage` event rows (90-day TTL) plus a permanent `llm_usage_daily`
`$inc` rollup keyed `{team_id, date, task, model}`. Optional `input_cost_per_1m_usd` /
`output_cost_per_1m_usd` on `LlmModel` feed `estimated_cost_usd`. `GET /llm-usage` reads the rollup,
scoped so a non-super-admin can only ever see their own team. Documented in OpenAPI.

Three honesty rules are enforced by tests, because each is a way a cost dashboard can quietly lie:
a provider reporting nothing records `usage_reported: false`, never zero tokens; an unpriced model
contributes no cost, never `$0`; cached tokens are not discounted, so the estimate is a defensible
ceiling. Metering is fire-and-forget and swallows its own failures — plus `flushLlmUsage()` for
shutdown and tests. An abandoned stream is metered in a `finally`, so cancelled answers don't vanish
from the ledger.

**Not done:** no admin UI for setting per-model pricing — the fields are settable via
`POST`/`PATCH /llm-providers/:id/models` but the AI Providers page has no input for them. Small
follow-up; belongs with Phase 5.

**2.2 Restructure the prompt for provider caching.** Split the single system string into an ordered, cache-friendly message list:

```
[0] system  — static persona + grounding rules      ← identical across every request, cacheable
[1] system  — team profile block (voice, instructions, subscriptions)  ← stable per team, cacheable
[2] system  — retrieved context, numbered            ← varies per turn
[3..] history
[n] user    — question
```

Then: Anthropic `cache_control: {type: "ephemeral"}` on blocks 0–1; OpenAI caches ≥1024-token stable
prefixes automatically once the prefix stops moving; Gemini explicit context caching. Blocks 0–1 are
also what make a per-team system prompt cheap.

> **STATUS: mechanism shipped, but it does not yet fire. Two blockers found in audit.**
>
> Shipped and tested (635/635, 53 suites): `cacheable?: boolean` on `AdapterChatMessage`; the
> Anthropic adapter sends `system` as a block array with one `cache_control` breakpoint at the end
> of the *leading contiguous* cacheable run; OpenAI/OpenRouter/bootstrap strip the hint before the
> wire; `chat.prompt.ts` marks blocks 0–1. Pinned by `chat.prompt.test.ts` (prefix byte-stability
> across turns) and 7 adapter cases.
>
> **Blocker A — the prefix is too short to qualify.** Persona ≈215 tokens + team block ≈30 ≈ **250
> tokens**, against a **1024-token minimum** for both Anthropic's explicit breakpoint and
> OpenAI/OpenRouter's automatic caching. Below the minimum the marker is silently ignored. So for a
> typical team the cache never engages — not broken, ineffective by construction.
>
> **Blocker B — key rotation destroys cache locality.** `nextRotationOffset`
> (`llmKeyHealth.ts:146`) does a global Redis `INCR` on *every* call, so consecutive turns of one
> conversation are served by different API keys. Prompt caches are scoped per key/account, so a
> multi-key provider pays the cache write repeatedly and rarely reads. The rotation predates this
> work and the two features were never reconciled.
>
> **The fix for A is a reorder**, not more markers: move the volatile context block *after* history
> so the prefix becomes `[persona, team, history…]`, which grows and stays stable within a
> conversation and crosses 1024 tokens after a few turns. That moves retrieved context into the
> final user turn — a standard RAG layout, but a change to grounding semantics, so it needs a
> decision rather than a silent edit.
>
> **The fix for B** is a sticky rotation offset keyed on `conversation_id` for the `chat` task only,
> leaving pure round-robin for categorization/dedup/etc. That trades some rate-limit spreading for
> cache locality — also a deliberate decision.
>
> Either way `cached_prompt_tokens` (Phase 2.1) is already recording, so both are measurable rather
> than arguable.

**2.3 Budget the context.** Replace the fixed "5 items × 300 chars" (`chat.retrieval.ts:9`, `:52`) with
a token budget (`CHAT_CONTEXT_TOKEN_BUDGET`, default ~2000): fill highest-fused-rank first, per-item
cap, stop at the budget. Skip any item whose text already appears in recent history.

**2.4 Compact history.** Keep the last N turns verbatim; summarize everything older into one rolling
`conversation_summary` persisted on first message of the conversation and refreshed every N turns.
Bounds a long conversation instead of letting it grow to the 10-message cliff and then silently
forget.

**2.5 Cache question embeddings** in Redis, reusing the `contentGeneration.embedCache.ts` pattern
verbatim (`sha256(text)` key, TTL const). Repeated/suggested prompts stop costing an embedding call.

**2.6 Cap the input.** `message: z.string().min(1).max(4000)` in `chat.validation.ts` — today a
500 KB paste goes straight to the provider.

**2.7 `max_tokens` on every adapter** (OpenAI + OpenRouter currently unbounded).

**2.8 Token-based budget** alongside the request counter: a per-team daily token ceiling in Redis
(`llm:tokens:{team}:{yyyy-mm-dd}`), 429 with a clear message at the limit. Requests are the wrong
unit for protecting a bill.

**Validate:** `npm run verify:chat-live` before/after, comparing recorded `prompt_tokens` per turn;
expect a large drop on turn 2+ from caching and history compaction.

---

### Phase 3 — Redis as a real cache layer · ~8 h

**3.1 `lib/cache.ts`** — one helper, mirroring `embedCache`'s shape and `llmKeyHealth`'s
degrade-open discipline:

```ts
cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>
invalidate(pattern: string): Promise<void>
```

Namespaced keys (`gs:v1:<domain>:<id>`), a version segment so a deploy can invalidate wholesale, a
short stampede lock, and **every path wrapped so a Redis outage is a cache miss, never an error**.

**3.2 Apply it**, TTLs chosen per volatility:

| Target | Key | TTL | Invalidate on |
|---|---|---|---|
| `isTeamReady()` (2 queries, every feed + chat request) | `team:ready:{id}` | 60 s | team update, brand-voice write |
| Team doc + `subscribed_categories` | `team:{id}` | 300 s | team update |
| `resolveVoiceOptions` | `team:voice:{id}` | 300 s | team update |
| Model resolution (per-task, per-team) | `llm:resolve:{team}:{task}` | 120 s | provider/model/default write |
| Style pack list | `stylepacks:active` | 600 s | style pack write |
| Chat retrieval result | `chat:ctx:{team}:{sha(q)}` | 300 s | ingestion run completes |
| Feed page 1 per (team, sort, category) | `feed:{team}:{h}` | 60 s | ingestion run completes |

**3.3 Metrics.** Hit/miss counters per domain, exposed on `/health` (or a small admin panel) — a cache
you can't observe is a cache you can't tune.

**Validate:** integration suite still green against `support/redisMock.ts`; measure p50/p95 on
`/news-items` and `/chat` before/after.

---

### Phase 4 — Unified Studio route · ~8 h

**Decided (§9.1): frontend-only merge. The backend stays split.** The two backend modules have
genuinely different shapes — different rate limiters (`llmRateLimiter` on all of `/content`),
different auth (`requireSuperAdmin` on `/generated-content/run`), different lifecycles (ephemeral
generation vs. persisted rows). The *user-visible* split is the actual problem, and this phase
touches no backend file.

**4.1** New `/dashboard/studio` with two URL-synced tabs: **Compose** (today's Generate) and
**Library** (today's Drafts), `?tab=compose|library`.
**4.2** `/dashboard/generate` and `/dashboard/drafts` become redirects — existing links, the ⌘K
palette, and the `navigate('/dashboard/drafts')` in `Generate.tsx:132` keep working.
**4.3** One sidebar entry replaces two.
**4.4 Server-side autosave during streaming** — the change that makes the merge worth doing. As each
format completes, the client calls the **existing** `POST /generated-content` to persist it as
`status: 'draft'`, then the **existing** `PATCH /generated-content/:id` for subsequent edits. The
Compose tab edits a real row instead of React state, so paid output stops being lost to a closed tab.
No new endpoint, no backend change — see §9.2.
**4.5** Cross-tab flow: saving in Compose highlights the new row in Library; "Edit" in Library opens
it in Compose.

---

### Phase 5 — Role-aware UI · ~8 h

**5.1 Give `team_admin` a real tier.** `getDashboardPaths(role, isTeamAdminOfActiveTeam)` returns a
third array. `team_admin` gets: Team Settings (already backend-gated by `requireTeamAdmin`), member
management, the team's own usage/cost view from Phase 2, and per-team model overrides.
**5.2** Repurpose the dead `admin.routes.tsx` as that tier, or delete it — do not leave it as
navigation nobody can reach.
**5.3** Replace scattered role-string checks with a `useCan(capability)` hook backed by one
capability map, so a permission change is one edit and the UI can't drift from
`requireTeamAdmin`/`requireSuperAdmin`.
**5.4** Rename `supperAdmin.routes.tsx` → `superAdmin.routes.tsx`.
**5.5** Group the six `admin/*` entries under one collapsible **Platform** nav section — a flat list
of fifteen items is the current super-admin experience.
**5.6 Backend:** add `PATCH /users/:id` (name, role) and `DELETE /users/:id` (super-admin only,
with a guard against deleting the last super_admin) to close the create-and-read-only gap, then
enable the row actions the UI currently explains away.

---

### Phase 6 — Feed / RAG experience · ~10 h

**6.1 Decide the dormant flags with the scripts that exist**, not by guessing:
`NEWS_FEED_SEMANTIC_MATCH_ENABLED` (`npm run db:verify-indexes`),
`CONTENT_CRITIQUE_ENABLED` (`npm run verify:bangla-bakeoff -- --critique both`),
`STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` (`npm run verify:style-pack-retrieval`).
Record each verdict and **delete the losing branch**. A permanently-undecided flag is a code path
every future change must keep working, with no evidence it should exist.

**6.2 "Why am I seeing this."** `score_source` (`'override' | 'team' | 'baseline'`) is already
computed and returned by `newsItem.service.ts:withTeamView` and never rendered. Surface it as a chip
— *Matched your AI subscription · opportunity 8.2 · scored against your brand voice*. Highest
engagement-per-hour item on the list.

**6.3 Daily Brief.** A digest view at the top of the feed: top 3 opportunities for this team since
yesterday, each with a one-line "why", each with a one-click **Generate**. Turns a scrolling list
into a daily habit — this is the "engaging" ask.

**6.4 Saved views.** Persist named filter+sort combinations per user.

**6.5 Compound index** for the real feed query shape
(`{lifecycle, category, category_group, current_trend_score, created_at}`) — improvement-plan P2-2,
still open, and it gets worse as the corpus grows.

**6.6 Feed → Compose** carries the item through in one click (partly there via `location.state`;
make it consistent from grid, table, and dialog).

---

### Phase 7 — Chat interface parity · ~10 h

`Chat.tsx` renders raw text in a bubble (`whitespace-pre-wrap`) and offers no message actions. To
reach Claude/ChatGPT/Gemini class:

| | Feature | Note |
|---|---|---|
| Must | Markdown + syntax-highlighted code blocks, per-block copy | answers are content — they need formatting |
| Must | **Stop generation** | server already supports it (`isCancelled` in `chat.service.ts:106`); the client never wires an `AbortController` |
| Must | Citation chips `[1]` → the source news item / draft | Phase 1.4 produces the data |
| Must | Copy / regenerate / edit-and-resend per message | |
| Must | Conversation rename, delete, search | today: auto-titled by preview, no delete |
| Should | Multi-line composer, Enter=send / Shift+Enter=newline | currently a single-line `<Input>` |
| Should | Per-conversation token + cost meter | from Phase 2.1 |
| Should | Virtualized message list | a long conversation renders every bubble today |
| Should | Model picker (Compose already has one) | |
| Nice | Streaming caret, skeleton-free first paint, `prefers-reduced-motion` | |

---

### Phase 8 — Production hardening · ~5 h

**No CI/CD** — decided. Both suites stay manual (`npm test` in each package). Consequence to accept
knowingly: nothing prevents a regression from being committed, so the validation commands in §7 are
a **release checklist you run by hand** before each deploy, not a safety net that runs itself.

- Request-id middleware + structured logging correlation.
- Ship `Dockerfile.prod` (the committed `Dockerfile` runs `ts-node-dev --respawn` and
  `docker-compose.yml` sets `NODE_ENV: development` — do not deploy that as-is).
- **Scheduler guard:** `node-cron` runs in-process, so N instances = N schedulers against one DB.
  Redis locks cover ingestion/refresh/retention today; make the guard explicit before scaling out.
- Load test `/news-items` and `/chat` at expected concurrency; record p95.

---

## 4b. Implementation log (running)

Verified after each step: backend `typecheck` clean, `npm test` green, `lint` 0 errors / 185 warnings
(unchanged baseline).

| Phase | State | Notes |
|---|---|---|
| 0 | **blocked — operator only** | Needs real secrets: `TRUST_PROXY_HOPS`, `SENTRY_DSN`, `SMTP_*`, `OPENROUTER_API_KEY`, credential rotation. Cannot be done from here. |
| 1 | done (1.5 blocked) | 1.5 needs an Atlas index drop/recreate — operator step. |
| 2.1 | done | Usage ledger + rollup + `GET /llm-usage`. |
| 2.2 | done | Prompt reorder (context → final user turn) so the prefix grows with history; two Anthropic cache breakpoints; sticky key routing by conversation. |
| 2.3 | done | `chat.budget.ts` — token budget + history dedup, replacing the fixed item count. |
| 2.4 | done | `chat.history.ts` — rolling extractive summary; boundary snaps so an exchange is never split. |
| 2.5 | done | Question embeddings reuse the existing Redis `getOrEmbedTopic` cache. |
| 2.6 | done | Chat input capped at 4000 chars. |
| 2.7 | done | `max_tokens` on OpenAI + OpenRouter (Anthropic already had it). |
| 2.8 | done | `llmUsage.budget.ts` + `llmTokenBudget` middleware, off by default (`RATE_LIMIT_LLM_DAILY_TOKENS=0`). |
| 3 | done | `lib/cache.ts` (versioned, degrade-open, SCAN-based invalidation, per-domain hit rates on `/health`); applied to `isTeamReady` and `resolveVoiceOptions` with write-path invalidation. |
| 4 | done | `/dashboard/studio` with Compose/Library tabs (2.28 kB shell, both halves still separately code-split); `/generate` + `/drafts` redirect; streamed output autosaves so a closed tab no longer discards paid work, and Save steps aside afterwards instead of filing a duplicate. |
| 5 | done | `team_admin` is a real tier: `getMe` now returns `team_admin_team_ids`, `lib/capabilities.ts` + `useCan()` replace scattered role checks, an **AI usage** page reads the Phase 2.1 ledger, `supperAdmin.routes.tsx` renamed, and `PATCH`/`DELETE /users/:id` close the create-and-read-only gap (guarded against removing the last super admin or yourself). |
| 6 | partial | 6.2 done — the feed now explains its own ranking via `score_source`, which the API always returned and nothing rendered. 6.5 was **already satisfied** (three matching compound indexes exist; a fourth would cost writes for nothing). 6.1/6.3/6.4 not done — see below. |
| 7 | not done | Chat UI parity (markdown, stop, citation chips, regenerate). |
| 8 | not done | Request-id middleware, `Dockerfile.prod`, scheduler guard. |

**Verified at this checkpoint:** backend **661/661** across 55 suites, frontend **27/27**, both typecheck
clean, backend lint 0 errors / 185 warnings (unchanged baseline), frontend lint 0 errors / 1
pre-existing warning, production build succeeds.


## 5. Sequencing — by phase, not by calendar

Each phase is independently shippable and independently verifiable. The only ordering that is
**mandatory** is the dependency chain below; everything else can be reordered or dropped freely.

### Hard dependencies

```
Phase 0  ──▶  everything      (a system with one shared rate-limit bucket
   config       else           and no error tracking is not "production grade")

Phase 1  ──▶  Phase 2.2-2.8   (no point optimizing the tokens of a prompt
 team scope      tokens         whose contents are about to change)
         ──▶  Phase 7.citations (Phase 1.4 is what produces the citation data)

Phase 2.1 ──▶ Phase 2.2-2.8   (without usage capture, every later token claim
usage capture   + Phase 3       is unfalsifiable — you cannot prove a saving
         ──▶  Phase 5.usage      you never measured)
                view

Phase 4  ──▶  Phase 6.6       (feed → Compose needs Compose to exist at its
studio merge    feed→compose    new route first)
```

### Everything else is free-standing

`Phase 3` (Redis), `Phase 5` (roles), `Phase 6.1-6.5` (feed), `Phase 8` (hardening) have no
dependencies on each other and can run in any order, or in parallel if more than one person is on it.

### Recommended phase order

| Order | Phase | Why here |
|---|---|---|
| 1 | **Phase 0** — production floor | 2 h of config that unblocks the definition of "production grade" |
| 2 | **Phase 1** — team-scoped chat | The correctness bug you actually reported. Ships alone. |
| 3 | **Phase 2.1** — usage capture | Small, and it turns every later phase from opinion into measurement |
| 4 | **Phase 2.2–2.8** — token engineering | Now measurable |
| 5 | **Phase 3** — Redis cache layer | Independent; biggest latency win per hour spent |
| 6 | **Phase 4** — Studio merge | Independent; also stops losing paid LLM output |
| 7 | **Phase 5** — role-aware UI | Independent |
| 8 | **Phase 6** — feed / RAG experience | 6.1 (flag verdicts) can move earlier — it is pure measurement, no code |
| 9 | **Phase 7** — chat UI parity | Best last: it renders what Phases 1 and 2 produce |
| 10 | **Phase 8** — hardening | Cleanup pass |

### Minimum viable slice

**Phase 0 + Phase 1 + Phase 2.1.** That fixes the team-isolation defect you named, closes the
rate-limiting and error-tracking holes, and instruments cost — after which every remaining phase can
be justified or dropped with data instead of argument.

---

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Team-scoped chat returns **empty context** for narrowly-subscribed teams | High | High — chat looks broken | Tiered fallback: subscribed → team's broad `category_group`s → explicit *"nothing in your team's feed covers this; here's the closest thing"*. Never silently widen to the global pool. |
| `$vectorSearch` filter fields not on the existing Atlas index | High | Medium | `db:create-indexes` then `db:verify-indexes` **before** flipping the flag; the try/catch fallback already exists |
| Changing embedding dimension breaks every vector index | Low | Critical | Do not change `EMBEDDING_MODEL` — all indexes are built for 1536 |
| Prompt caching gives less than expected (OpenRouter passthrough varies by provider) | Medium | Low | 2.1's usage data measures it; keep the restructure regardless — it's cleaner either way |
| Redis caching serves stale team readiness / subscriptions after a settings change | Medium | Medium | Short TTLs (60–300 s) + explicit invalidation on write; never cache authorization decisions |
| Studio merge breaks deep links / ⌘K entries | Medium | Low | Redirects, not deletions; the palette derives from the same route config |
| Autosaving every streamed format inflates the drafts table | Medium | Low | Mark autosaves `source: 'auto_draft'`, prune unedited ones after N days |
| `team_admin` tier exposes actions the backend rejects | Medium | Medium | Derive the capability map from the backend's own `requireTeamAdmin` usage; add integration tests per capability |
| Rotating `JWT_*` logs every user out | Certain if done | Medium | Schedule it; announce it |
| Scope is 4 weeks of work | Certain | — | Phases are independently shippable; Phase 0+1 alone fixes the stated correctness bug |

---

## 7. Validation

```bash
# backend
cd backend && npm run typecheck && npm run lint && npm test     # baseline: 580/580, 50 suites

# frontend
cd frontend && npx tsc -b && npm run lint && npm test && npm run build   # baseline: 27/27

# indexes — before enabling any vector flag
cd backend && npm run db:create-indexes && npm run db:verify-indexes

# retrieval quality, per phase
npm run verify:chat-retrieval          # Phase 1 — offline ranking
npm run verify:chat-live               # Phase 1/2 — live, records tokens
npm run verify:style-pack-retrieval    # Phase 6.1
npm run verify:bangla-bakeoff -- --critique both   # Phase 6.1

# health
curl -s $API/health   # {"status":"ok","mongo":"up","redis":"up"}
```

---

## 8. Acceptance

- [ ] **R1** A leakage test proves team A's chat context contains zero of team B's items — asserted on retrieved context, not reply text
- [ ] **R2** Chat answers from news + drafts + brand voice + team profile, with `[n]` citations
- [ ] **R3** `llm_usage` records every call; measured prompt-token drop on turn 2+; chat input capped; `max_tokens` on all adapters; token-based team budget enforced
- [ ] **R4** Markdown, stop, regenerate, edit-resend, citations, cost meter all working
- [ ] **R5** One Studio route with Compose/Library tabs; old paths redirect; streamed output persists server-side
- [ ] **R6** `lib/cache.ts` in use at 7 call sites with hit/miss metrics; all three dormant flags decided and the losing branches deleted
- [ ] **R7** "Why this item" chip, Daily Brief, saved views, feed compound index
- [ ] **R8** `team_admin` has a distinct navigable surface; capability map drives gating; `PATCH`/`DELETE /users/:id` shipped
- [ ] **R9** All Phase 0 vars set and verified; `Dockerfile.prod` in the deploy path
- [ ] Both suites green (run by hand — see §9.3); no new lint errors
- [ ] Patterns mirrored, not reinvented

---

## 9. Decisions — settled

| # | Decision | Consequence for this plan |
|---|---|---|
| 1 | **Backend stays split.** `/content` (generation) and `/generated-content` (drafts) remain two modules with their own routes, rate limiters, and auth. | Phase 4 is a **frontend-only** merge. `contentGeneration.route.ts` and `generatedContent.route.ts` are untouched; the OpenAPI contract does not change. |
| 2 | **Hard team scope with a labeled fallback tier**, as recommended. Chat never silently widens to the global pool. | Phase 1 implements the three-tier fallback in §6's mitigation: subscribed categories → the team's broad `category_group`s → an explicit *"nothing in your team's feed covers this"*. Each tier is **labeled in the response**, so a widened answer is visibly a widened answer. |
| 3 | **No CI/CD.** | Phase 8 drops the CI item. §7's commands become a manual pre-release checklist. |
| 4 | **`DEFAULT_FORMATS` unchanged** — stays single-format (`facebook_post`). | No change to `contentGeneration.formats.ts:67` or `frontend/src/lib/api/content.ts`. Generation cost per request is preserved. |
| 5 | **Phase-wise sequencing, no calendar.** | §5 rewritten as a dependency graph + recommended order. |

### 9.1 What decision 2 means precisely

Three tiers, tried in order, first non-empty one wins:

| Tier | Filter | Response label |
|---|---|---|
| 1 | `category ∈ subscribed_categories` OR `category_group ∈ subscribed_categories` | *(none — the normal case)* |
| 2 | `category_group ∈ (broad groups of the team's subscriptions)` | `context_tier: 'broadened'` — UI shows *"Widened to related categories in your feed"* |
| 3 | nothing matched | `context_tier: 'none'` — the model is instructed to say it has no data on this in the team's feed, and to suggest subscribing to a category |

**Tier 3 never falls through to the global pool.** That is what makes the isolation real rather than
merely technically true, and it is what the leakage test in Phase 1.6 asserts.

### 9.2 What decision 1 means precisely

- Frontend: `/dashboard/studio?tab=compose|library`, old paths redirect. One sidebar entry.
- Backend: unchanged routes. The Compose tab still calls `POST /content/generate/stream`; the Library
  tab still calls `GET /generated-content`.
- Phase 4.4 (autosave during streaming) is therefore a **client-side orchestration**: as each format
  completes on the stream, the client calls the existing `POST /generated-content`. No new endpoint,
  no module merge — which is also why this decision costs nothing.

### 9.3 What decision 3 means precisely

Run before every deploy, by hand:

```bash
cd backend  && npm run typecheck && npm run lint && npm test
cd frontend && npx tsc -b && npm run lint && npm test && npm run build
```

Baselines to compare against: backend **580/580** across 50 suites, frontend **27/27**, build
succeeds with the largest chunk ~480 kB (151 kB gzip).
