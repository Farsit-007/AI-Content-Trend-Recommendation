# Robayat Kalam Farsit — API Contract & Platform Analytics

**Role:** API design, platform analytics (Facebook/YouTube/LinkedIn), reporting, opportunity scoring  
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

### July 14 — Platform Analytics

> ✅ **All three are unblocked as of PR #14.** Import `getPlatformToken(platform)` from
> `backend/src/app/lib/platformCredentials.ts` — **never read `process.env` directly.** It resolves
> a token from the credential store, falling back to the `.env` bootstrap token, so you can build
> and typecheck against it today and it starts returning real tokens the moment Mursalin's values
> land in `.env`. A missing platform throws a typed `AppError(424)` — catch it and render
> "connected but pending approval" (requirements §5.6) rather than letting it 500.

| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `facebook-analytics` | `feat/facebook-analytics` | FR-06, FR-26 | Meta Graph API: reach, engagement, top posts, best times; 6h refresh. **Include manual refresh endpoint (FR-26) for Mehedi's admin UI. Start here — slowest API.** |
| ⬜ Todo | `youtube-analytics` | `feat/youtube-analytics` | FR-07 | YouTube Data API v3: views, watch time, CTR, top videos |
| ⬜ Todo | `linkedin-analytics` | `feat/linkedin-analytics` | FR-08 | LinkedIn API: impressions, engagement, demographics. **Cut first if behind — Should Have, approval may not arrive.** |

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
