# Samin Israr Ravi — Backend: Ingestion & AI Intelligence

**Role:** Backend lead — ingestion pipeline, AI categorization, content generation, RAG chat  
**Owns:** `backend/shared/**`, `backend/ingestion/**`, `backend/generation/**`, `backend/rag/**`  
**Deadline:** July 16, 2026

---

## Task Board

### ⚡ July 13 FIRST — Critical Architecture Fixes (before any code)
| Status | Task | Notes |
|--------|------|-------|
| ✅ Done | Fix MongoDB setup | Atlas M0 cluster created; `DATABASE_URL` points at it; `$vectorSearch` confirmed live (no "unknown stage" error); local `mongodb` service removed from `docker-compose.yml`. |
| ✅ Done | Verify embedding provider | `nomic-ai/nomic-embed-text` isn't served on OpenRouter (400 "Model does not exist"), but `openai/text-embedding-3-small` is — confirmed live (200 OK, 1536-dim vector). Chosen provider: **OpenRouter**, via the `openai` SDK — no local model runtime (Ollama) needed. |

### July 13 (Today) — Foundation
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ✅ Done | `backend-scaffold` | `ravi/feat/backend-scaffold` | Node + TS server, Mongo/Redis, OpenRouter LLM + embeddings client (via `openai` SDK), env config, startup connectivity check. Implemented and live-verified end-to-end (typecheck passes; `npm run dev` connects to Atlas/Redis/OpenRouter and logs `OK` for all four checks; a broken env var exits with a clear error). **Merged to `main` via PR #6.** |
| ✅ Done | `db-vector-indexes` | `ravi/feat/db-vector-indexes` | 3 Atlas Vector Search indexes + collection schemas. **PR #10 merged to `main`.** Live-verified against Atlas M0 (create + idempotent re-run + `$vectorSearch` query all passed). |

### July 14 — Ingestion Pipeline + Brand Voice
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ✅ Done | `multi-team-rbac` | `main` (direct) | — | Reworked the `User` module from single-tenant to multi-team, role-based: new `Team`/`TeamMembership` modules (many-to-many membership), `role: 'admin' \| 'user'` on `User`, `requireAdmin`/`requireTeamAccess` middleware, admin-only user/team creation (public `/auth/register` removed, replaced by admin-only `POST /users` + `npm run seed:admin` bootstrap). `PlatformPost`/`BrandVoiceExample` now carry `team_id` and are auth-gated + team-scoped (previously fully unauthenticated). New `PlatformCredential` module stores per-team, AES-256-GCM-encrypted social platform tokens (masked list + explicit `/reveal`), replacing the single `.env`-only credential from `platform-api-credentials` (PR #14) — `getPlatformToken()` now resolves per-team first, `.env` bootstrap as fallback. Also generalized the credential platform field from a fixed `facebook \| youtube \| linkedin` enum to any lowercase platform slug, so a team can store Reddit/Twitter/Instagram/TikTok credentials too. `npm run typecheck` + `npm run lint` clean; Postman collection (`backend/Hackathon process.postman_collection.json`) fully rewritten to cover every current endpoint with example bodies. |
| ✅ Done | `super-admin-platform-catalog` | `main` (direct) | — | Added a `super_admin` role (superset of `admin`; only a `super_admin` can create/promote another one) plus a new `PlatformCatalog` module: a super_admin curates which platforms exist system-wide (`POST/GET /platforms`, `PATCH /platforms/:name/enable\|disable`), and each **team** independently enables only the platforms it needs (`/teams/:teamId/platforms/:platform/enable\|disable`). `PlatformCredentialService.upsertCredential` now rejects a credential for a platform the team hasn't enabled; `getPlatformToken()` re-checks catalog+team enablement live, so a super_admin disabling a platform globally blocks every team immediately (re-enabling restores it with no team-side action). Also added auto-seeding: `lib/seedSuperAdmin.ts` ensures `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` (`.env`, optional) exists as a `super_admin` on every server boot — idempotent, never overwrites an existing account. `typecheck`/`lint` clean. |
| ⬜ Todo | `news-ingestion-pipeline` | `feat/news-ingestion-pipeline` | FR-01, FR-25 | HackerNews, Dev.to, GitHub, Reddit, RSS fetchers; 3h cron. **Include manual trigger endpoint (FR-25) for Mehedi's admin UI.** |
| ⬜ Todo | `filter-pipeline` | `feat/filter-pipeline` | FR-02, FR-04 | 4 layers: keyword → vector dedup → Redis cache → relevance gate |
| ⬜ Todo | `brand-voice-rag` | `feat/brand-voice-rag` | FR-18 | Moved up from Jul 15 — only depends on indexes. Mehedi collects the 25–30 seed posts today. |

### July 15 — AI Layer + Content Generation + Chat
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
| ⬜ Todo | `ai-categorization-scoring` | `feat/ai-categorization-scoring` | FR-03 | Batched LLM categorize + relevance + trend_score math + impact note |
| ⬜ Todo | `content-generator` | `feat/content-generator` | FR-13–17, FR-19–21 | 5 formats: FB post, Reel, LinkedIn, YouTube idea, caption |
| ⬜ Todo | `ask-growth-studio-chat` | `feat/ask-growth-studio-chat` | FR-22, FR-23 | Moved up from Jul 16. RAG chat: embed query → vectorSearch → grounded Banglish answer. **Cut this if behind — Should Have.** |

### July 16 — Integration Only (NO feature work)
| Status | Work | Notes |
|--------|------|-------|
| ⬜ Todo | Integration testing | Ingestion → scoring → generation end-to-end |
| ⬜ Todo | Demo prep | Run ingestion, pre-warm demo topics into Redis cache before presenting |

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
- You are **fully independent** — no one blocks you.
- Share your `.env` values (Mongo URI, Redis URL, OpenRouter key) with Robayat as soon as scaffold is done — that's the only handoff. **`ravi/feat/backend-scaffold` is merged to `main` (PR #6) — only remaining step is sharing the `.env` values with Robayat (tasks.md 7.4).**
- Robayat and Mehedi can work in parallel from Day 1 without needing your features to be complete.

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
- **2026-07-13**: Critical fixes #1 (Atlas Mongo) and #2 (embedding provider) resolved and live-verified. `backend-scaffold` implemented: Redis client (`ioredis`), OpenRouter LLM + embeddings client (`openai` SDK), env config, startup `verifyConnections()` check. Old Auth/User/Cloudinary/Email boilerplate removed. Not yet committed — next step is to commit, push, and open the PR.
- **2026-07-14**: `ravi/feat/backend-scaffold` (PR #6) merged into `main`. All `openspec/changes/backend-scaffold/tasks.md` items are checked off except 7.4 (share `.env` values with Robayat — manual, do this next). Next up: `db-vector-indexes`.
- **2026-07-14**: `db-vector-indexes` implemented on `ravi/feat/db-vector-indexes`, all 16 `tasks.md` items checked off, **PR #10 merged to `main`**. Corrected `project-ida-requirments.md`'s stale 768-dim/`nomic-embed-text` assumption — all 3 indexes and schemas use 1536-dim (`openai/text-embedding-3-small`), matching the provider verified in `backend-scaffold`. Also resolved a naming inconsistency in the requirements doc: the third collection is `platform_posts` (standalone), not `platform_analytics.posts` — flagged in the PR for Robayat before he builds `opportunity-scoring`. Live-verified against Atlas M0: index creation, idempotent re-run, and real `$vectorSearch` queries all passed. Next up: `news-ingestion-pipeline`.
- **2026-07-14**: `multi-team-rbac` — the company actually runs several growth teams, each with its own members and its own social accounts, so the single-tenant `User` module from `platform-api-credentials` (PR #14) needed to become multi-team and role-based before ingestion/analytics data could be scoped correctly. Added `Team`/`TeamMembership` (many-to-many), `role` on `User` (admin bypasses all team-scoping), admin-only user/team creation (removed public self-registration; added `npm run seed:admin` to bootstrap the first admin), and a new `PlatformCredential` module storing per-team AES-256-GCM-encrypted platform tokens (masked list + explicit reveal endpoint) in place of the old single `.env`-only credential. `PlatformPost`/`BrandVoiceExample` gained `team_id` + auth (they had none before). Generalized the credential `platform` field to accept any social platform slug, not just facebook/youtube/linkedin, since teams may use Reddit/Twitter/Instagram/TikTok too — the 3 named platforms keep their `.env` bootstrap-token fallback, anything else must be a stored team credential. `typecheck`/`lint` clean; full Postman collection rewrite with examples for every endpoint.
- **2026-07-14**: `super-admin-platform-catalog` — follow-up requirement: the company wants central control over *which* platforms exist at all (a `super_admin` curates the catalog and flips platforms on/off system-wide), while each team independently opts in to only the platforms it needs. Added the `super_admin` role (with an escalation guard — only an existing `super_admin` can create another) and a `PlatformCatalog` module (`PlatformCatalog` = global list, `TeamPlatform` = each team's own switch). Wired enablement checks into both the credential write path (`PlatformCredentialService.upsertCredential`) and the read path (`getPlatformToken()`), so a globally-disabled platform stops resolving immediately everywhere, confirmed with the user rather than assumed. Also added `lib/seedSuperAdmin.ts`, called from `server.ts` on every boot, so the platform-catalog owner always exists without anyone having to remember `npm run seed:admin` — driven by `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` in `.env`. `typecheck`/`lint` clean; couldn't live-verify against real Atlas in this sandbox (no network egress), flagged for the user to confirm the boot log locally.
