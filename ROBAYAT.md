# Robayat Kalam Farsit — API Contract & Platform Analytics

**Role:** API design, social handle analytics (dynamic per-team platforms — Facebook/YouTube/LinkedIn built in today), reporting, opportunity scoring  
**Owns:** `backend/analytics/**`, `backend/reports/**`, `openapi/**`  
**Deadline:** July 16, 2026

---

## Task Board

### ⚡ July 13 FIRST — External Dependency (before any code)
| Status | Task | Notes |
|--------|------|-------|
| ⬜ Todo | Ping Mursalin for platform tokens | **Mursalin (page admin) is not on the dev team** — he must generate the Meta page token, YouTube API key, and LinkedIn app access. Chase TODAY. ⚠️ Note: this **no longer blocks the analytics code** (PR #14 shipped the resolver + `.env` fallback), but it does block them returning *real data*. |
| ⬜ Todo | **Ask Mursalin: OAuth client id + secret, or tokens only?** | **New ask, not on the original plan.** The plan only ever requested *tokens*. The per-user OAuth store additionally needs a **client id + client secret per provider**, with our callback URL registered on each app. **If he can only produce tokens, the OAuth store cannot be built** — and that's fine: `.env` tokens alone fully unblock the analytics work. This answer decides whether the remaining OAuth work happens at all. |

### July 13 (Today) — API Contract + Credentials
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ✅ Done | `api-contract-openapi` | `feature/api-contract-openapi` | **Merged to `main` via PR #12.** OpenAPI 3.1 contract for all `/api/v1` resources (news-items, platform-posts, brand-voice-examples), served as Swagger UI at `/api/v1/docs` and raw spec at `/api/v1/openapi.json`. typecheck + lint clean; spec validates (6 paths, 15 ops); docs UI renders. |
| ✅ Done | `platform-api-credentials` | `feature/platform-api-credentials` | **Merged to `main` via PR #14** — `getPlatformToken()` resolver, AES-256-GCM token encryption, fail-fast zod env validation, `npm run verify:credentials`, and an auth layer (bcrypt + JWT `requireAuth`). **This unblocks all 3 analytics changes now** — they import `getPlatformToken()` and pick up real tokens the moment values land in `.env`, no code change needed. ⚠️ **Scope deviation:** built per-user OAuth + auth, where the plan said tokens→`.env`. ⚠️ **Not built:** the OAuth credential store itself (connect/callback, refresh, `/credentials`) — blocked, see below. **Submit LinkedIn app NOW — approval takes 2–3 days.** |

### July 14 — Social Handle Analytics

> ⚠️ **Updated 2026-07-14 — this is now ONE task, not three.** `facebook-analytics` / `youtube-analytics` / `linkedin-analytics` are **merged into `social-handle-analytics`**, because the backend became multi-team with a dynamic platform catalog (`multi-team-rbac`, `super-admin-platform-catalog` — see `SAMIN.md`): platforms are no longer a fixed 3-item list, so "one task per hardcoded platform" no longer makes sense. Build it as **one generic job** — for every team, for every platform that team has enabled, dispatch to that platform's adapter — with 3 adapter implementations to start (Facebook, YouTube, LinkedIn). Adding a 4th platform later (Reddit, Twitter/X, …) means writing one more adapter function, not a new task/branch/PR.
>
> What actually changed under you, mechanically:
> - **`getPlatformToken(platform, teamId?)`** (was `(platform, userId?)`). Resolution order: (1) the given team's own stored, encrypted credential, (2) the `.env` bootstrap token (still works with **no `teamId`**, so you can keep building/typechecking against it exactly as before), (3) throws the same typed `AppError(424)` — still catch it and render "connected but pending approval".
> - **New gate:** a team must have the platform *enabled* (via the new Platform Catalog, `/teams/:teamId/platforms/:platform/enable`) for its stored credential to resolve at all — a super_admin disabling a platform system-wide blocks it for every team immediately, even mid-flow. If a token stops resolving unexpectedly, check the catalog/team-enablement state before assuming a bug.
> - **`PlatformPost` now requires `team_id`** (unique index is `{team_id, platform, post_id}`) and its routes require a bearer token (`requireAuth`) — when your analytics job writes posts, pass the owning team's id; when it runs without an HTTP caller (a cron job), that's a service-level call, not through the authed route, so it's unaffected by the auth requirement.
> - `platform` is no longer a fixed `facebook | youtube | linkedin` enum anywhere — it's any lowercase slug (`string`, not a union type).
>
> Everything else from PR #14 still stands: **never read `process.env` directly**, keep importing from `backend/src/app/lib/platformCredentials.ts`.

| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `social-handle-analytics` | `feat/social-handle-analytics` | FR-06, FR-26 | One job, 3 adapters: Meta Graph API (Facebook), YouTube Data API v3, LinkedIn API — reach, engagement, top posts, best times, per team's enabled platforms; 6h refresh. **Include manual refresh endpoint (FR-26) for Mehedi's admin UI.** Start with the Facebook adapter — slowest API. LinkedIn adapter can lag behind (approval may not arrive) without blocking the other two or the task as a whole. |

### July 15 — Scoring + Reporting
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `opportunity-scoring` | `feat/opportunity-scoring` | FR-24 | Embed posts → vectorSearch → opportunity_score = trend × audience |
| ⬜ Todo | `cross-platform-report` | `feat/cross-platform-report` | FR-09–12 | Unified 30-day report + AI insight + content-opportunity ranking; Redis 6h |

### July 16 — Integration
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ✦ | Integration testing | — | Verify analytics data flows into Mehedi's report-ui correctly |

---

### Status Key
| Symbol | Meaning |
|--------|---------|
| ⬜ Todo | Not started |
| 🔄 In Progress | Branch open, work ongoing |
| 👀 In Review | PR open, awaiting review |
| ✅ Done | Merged to `main` |

---

## Independence Notes
- You are **independent from Samin's features** — you only need his `.env` values (Mongo URI, Redis URL) to wire connections, not his completed features.
- Mehedi builds against your **stub server from Day 1** — he doesn't need the real analytics to be working.
- LinkedIn approval is your biggest risk — start the app registration today even before any code.

---

## API Credentials Tracker

| Platform | App Created | Token Generated | Added to `.env` | OAuth client id + secret |
|----------|:-----------:|:---------------:|:---------------:|:------------------------:|
| Facebook / Meta | ⬜ | ⬜ | ⬜ | ⬜ |
| YouTube | ⬜ | ⬜ | ⬜ | ⬜ (not needed — API key is enough) |
| LinkedIn | ⬜ | ⬜ | ⬜ | ⬜ |

> Share tokens securely (never commit to git). Whoever has page-admin access generates them.
> `backend/.env.example` documents every var name and the exact callback URL to register per provider.
>
> **The last column is the new blocker.** Token → analytics works. Token + client id/secret → the
> per-user OAuth store can also be built. Without client credentials, only the token column matters.
>
> `npm run verify:credentials` reports PASS / FAIL / SKIP per platform — run it after adding anything
> here. Currently `SKIP / SKIP / SKIP` (nothing configured yet); LinkedIn `SKIP` is an acceptable
> end state if approval never lands.

---

## Daily Workflow

```bash
# Start of day
git checkout main && git pull --rebase origin main
git checkout feat/<change-name> && git rebase main

# Plan + implement
/opsx:propose <change-name>
/opsx:apply <change-name>

# Before PR
cd backend && npm run typecheck

# Ship
git push -u origin feat/<change-name>
gh pr create --fill
```

---

## Notes
<!-- Add blockers, decisions, or progress notes here -->
- **2026-07-14**: Samin shipped `multi-team-rbac` and `super-admin-platform-catalog` directly to `main` (not through a PR/branch this time — flagged here so it's not a surprise in your next `git pull`). Net effect for your upcoming analytics work: `getPlatformToken()` gained a `teamId` param and a platform-catalog enablement gate (see the updated note in the July 14 section above), and `PlatformPost` now requires `team_id`. Nothing you've already built breaks — the `.env` bootstrap path still works with no `teamId` — but any *new* code should thread a team id through once you're storing/reading real per-team data.
