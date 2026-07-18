# Growth Studio — Master Plan
**Deadline: July 16, 2026** · 3 developers · 4 days

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ Todo | Not started |
| 🔄 In Progress | Branch open, work ongoing |
| 👀 In Review | PR open, awaiting review |
| ✅ Done | Merged to `main` |

---

## ⚡ Critical Fixes — Resolve Before Any Backend Code (July 13)

| # | Status | Issue | Owner | Fix |
|---|--------|-------|-------|-----|
| 1 | ✅ | `docker-compose.yml` uses `mongo:7-jammy` — **`$vectorSearch` is Atlas-only** and will fail on this image | Samin | **Resolved**: `DATABASE_URL` points at a real Atlas M0 cluster; `$vectorSearch` confirmed working live; local `mongodb` service removed from `docker-compose.yml` |
| 2 | ✅ | Plan assumes embeddings via OpenRouter — **OpenRouter may not serve an embeddings API** | Samin | **Resolved**: `nomic-ai/nomic-embed-text` isn't on OpenRouter, but `openai/text-embedding-3-small` is — confirmed live. LLM + embeddings both go through OpenRouter via the `openai` SDK; no local model runtime (Ollama) needed |

---

## Independence Strategy

| Developer | How they stay unblocked |
|-----------|------------------------|
| **Samin** | Fully independent — owns the whole backend stack |
| **Robayat** | Independent — API contract; only needs Samin's `.env` values on Day 1 |
| **Mehedi** | Uses **hardcoded mock data** for all UI from Day 1 — zero dependency on backend. Swaps to real API on Day 3 behind a `USE_MOCK` flag. |

> **The trick:** Mehedi never waits. Build every screen with realistic mock JSON. When Robayat's API contract is live, swap `mockData` → `fetch('/api/...')` in one pass — but **keep the mocks as the demo-day fallback**.

---

## July 13 (Today) — Foundation

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | ⚡ Critical fixes #1 + #2 | — | ✅ Done | Atlas cluster + `$vectorSearch` confirmed live; OpenRouter confirmed as embedding provider (`openai/text-embedding-3-small`) |
| **Samin** | `backend-scaffold` | `ravi/feat/backend-scaffold` | ✅ Done | Node + TS, Mongo/Redis, OpenRouter LLM + embeddings client, env config, startup connectivity check — implemented and live-verified (typecheck, `npm run dev` connects to Atlas/Redis/OpenRouter). Merged to `main` via PR #6. |
| **Samin** | `db-vector-indexes` | `ravi/feat/db-vector-indexes` | ✅ Done | 3 Atlas Vector Search indexes + collection schemas — implemented, live-verified against Atlas M0, PR #10 merged to `main` |

| **Robayat** | `api-contract-openapi` | `feature/api-contract-openapi` | ✅ Done | OpenAPI 3.1 contract for all `/api/v1` resources — Swagger UI at `/api/v1/docs`, raw spec at `/api/v1/openapi.json`. typecheck/lint clean, spec validates, UI renders. Merged to `main` via PR #12 — Mehedi can build against it now. |
| **Mehedi** | `news-feed-dashboard` | `feat/news-feed-dashboard` | ⬜ Todo | daily.dev-style feed, tabs, sort, trend + "High opportunity" badges — mock data |
| **Mehedi** | `content-generator-ui` | `feat/content-generator-ui` | ⬜ Todo | Generate button → 5 format panels, copy-to-clipboard — mock data |

---

## July 14 — Core Features

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `multi-team-rbac` | `main` (direct) | ✅ Done | Backend pivot: single-tenant → multi-team, role-based (`Team`/`TeamMembership`, `role` on `User`, admin-only user/team creation). `BrandVoiceExample` now `team_id`-scoped + auth-gated. See `SAMIN.md`. |
| **Samin** | `super-admin-platform-catalog` | `main` (direct) | ✅ Done | New `super_admin` role, sitting above `admin` in the RBAC hierarchy. Auto-seeds the first super_admin on server boot from `.env`. See `SAMIN.md`. |
| **Samin** | `news-ingestion-pipeline` | `feature/news-ingestion-pipeline` | ✅ Done | HackerNews, Dev.to, GitHub Trending (scrape), Reddit, RSS; in-process `node-cron` (default 3h). Includes FR-25 manual trigger (`POST /news-items/ingest`, admin-only). **Merged to `main` via PR #16.** Live-verified against real APIs/LLM/Atlas. See `SAMIN.md` for the full write-up, including a deliberate deviation from the plan below. |
| **Samin** | `filter-pipeline` | *(folded into `news-ingestion-pipeline`)* | ✅ Done | ⚠️ Built differently than planned: dedupe is exact-match on `content_hash`, not vector similarity; no Redis cache layer; no separate keyword pre-filter. See `SAMIN.md`'s deviation note before assuming FR-02's "vector similarity" dedup is literally what's live. |
| **Samin** | `filter-pipeline` (semantic dedup follow-up) | `main` (direct) | ✅ Done | Closes the vector-similarity gap above: added a real cross-source **semantic** dedup layer (embeddings + cosine similarity, threshold `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD=0.88`, recalibrated from an initial `0.93` guess after live verification against real embeddings). Implemented + live-verified end-to-end against real Atlas/Redis/OpenRouter. **Committed and pushed to `main`** (`b2bc131`). Full detail in `SAMIN.md`. |
| **Samin** | `brand-voice-rag` | `main` (direct) | ✅ Done | New `POST /content/generate` (`backend/src/app/modules/ContentGeneration/`), team-scoped RAG over `BrandVoiceExample`, cold-start fallback to a generic prompt, single structured-JSON LLM call. Live-verified against real Atlas/Redis/OpenRouter, including a real auth bug found and fixed. **Deliberate scope cut vs. this plan**: in-app cosine similarity, not `$vectorSearch`; no Redis caching / no `generated_content` collection — stateless endpoint. Full write-up in `SAMIN.md`. |
| **Mehedi** | `chat-ui` | `feat/chat-ui` | ⬜ Todo | Ask Growth Studio chat panel — mock data |
| **Mehedi** | `admin-triggers-ui` | `feat/admin-triggers-ui` | ⬜ Todo | "Run ingestion" button — mock data |
| **Mehedi** | Brand-voice seed posts | — | ⬜ Todo | Collect 25–30 real high-engagement posts (needs Mursalin) — unblocks Samin's RAG |

---

## July 15 — AI Layer + Wire Up

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `ai-categorization-scoring` | `main` (direct) | ✅ Done | This row's description was already stale — batched categorize/relevance/trend_score/impact note shipped under `news-ingestion-pipeline`. Actually built: categorization confidence + `needs_review` flag, a deterministic `opportunity_score` formula (`W_RELEVANCE×relevance + W_TREND×trend + W_FIT×audience_fit`, replacing free-form LLM scoring), team-customizable categories, and a per-team category/score override (`NewsItemCategoryOverride`, merged into reads without mutating the shared item). Also wired the Feed to the real API — it was still 100% mock data. Live-verified end-to-end against real Atlas/OpenRouter, including cross-team override isolation. Full write-up in `SAMIN.md`. |
| **Samin** | `content-generator` | `main` (direct) | ✅ Done | Also stale — the 5 formats shipped under `brand-voice-rag` already. What was actually missing and got built: `team-selector`, a real `TeamProvider`/`TeamSelector` (backed by `GET /auth/me` + `GET /teams`) replacing the `VITE_DEFAULT_TEAM_ID` placeholder that `brand-voice-rag` had left behind. Live-verified via a real headless-browser session against the running backend (no `chromium-cli`/Playwright available, so driven directly over the Chrome DevTools Protocol) — caught and fixed two real bugs (a `_id`/`id` field-shape mismatch, and a responsive bug that hid the single-team label below 768px). `typecheck`/`lint` clean. **Not committed yet** — see `SAMIN.md`. |
| **Samin** | `ask-growth-studio-chat` | `main` (direct) | ✅ Done | Moved up from Jul 16, **not cut** — see the Descope Order note below. New `POST /chat`: intent-classified retrieval over the team's trending news, multi-turn conversation history, cross-team `conversation_id` isolation live-verified. `ChatPanel.tsx` wired to the real endpoint. 4/6 verification tasks live-verified; 2 blocked by an exhausted OpenRouter free-tier quota (pipeline confirmed working end-to-end up to the final LLM call — re-run `npm run verify:chat-live` once quota resets). Full write-up in `SAMIN.md`. |
| **Mehedi** | `api-wiring` | `feat/api-wiring` | ⬜ Todo | Swap mocks → real `fetch()` behind a `USE_MOCK` flag. **Do NOT delete the mock folder** — it's the demo fallback. |

---

## July 16 — Integration + Demo (NO feature work)

| Developer | Work | Status | Notes |
|-----------|------|--------|-------|
| **Samin** | Integration testing | ✅ Done | Backend API integration test suite (Jest + Supertest + `mongodb-memory-server` + `ioredis-mock`), 28 tests across auth/teams/news-items/content-generation/chat. Done ahead of schedule on 2026-07-14. **Not committed yet** — see `SAMIN.md`. |
| **Mehedi** | UI polish + demo script | ⬜ Todo | Loading/error/empty states, responsive check, demo walkthrough script |
| **All** | Demo prep | ⬜ Todo | Run ingestion, pre-warm demo topics into Redis, warm app 5 min before presenting (NFR-12) |

---

## Descope Order (pre-agreed — no debates at 11pm)

1. ~~**Cut second:** `ask-growth-studio-chat` + `chat-ui` — FR-22/23 Should Have; demo survives without it~~ **Not needed — shipped 2026-07-14.** Both sides done (see Samin's July 15 row above and `chat-ui` in `MEHEDI.md`); only the 2 blocked-on-quota verification tasks remain before demo day.
2. **Never cut:** news feed, content generator — these ARE the demo

---

## Review Pairs (~7 PRs each over 4 days)

| Author | Reviewer |
|--------|----------|
| Mehedi | Samin |
| Samin | Robayat |
| Robayat | Mehedi |

Review within 2 hours of PR open. Branches must not age overnight.

---

## Feature Coverage Map

| FR | Feature | Backend (owner) | Frontend (Mehedi) |
|----|---------|----------------|-------------------|
| FR-01 | News ingestion | Samin | news-feed-dashboard |
| FR-02, FR-04 | Filter pipeline | Samin | (internal, no UI) |
| FR-03 | AI categorization + impact note (+ confidence/needs-review, team-custom categories, per-team override — `ai-categorization-scoring`) | Samin | trend badges in feed + recategorize control |
| FR-05 | Trend feed | Samin | news-feed-dashboard |
| FR-13–17, FR-19–21 | Content generator (+ real team-selector, closing the `VITE_DEFAULT_TEAM_ID` placeholder — `team-selector`) | Samin | content-generator-ui |
| FR-18 | Brand voice RAG | Samin | (internal) |
| FR-22, FR-23 | Ask Growth Studio chat (`ask-growth-studio-chat`, done 2026-07-14) | Samin | chat-ui (done, see `MEHEDI.md`) |
| FR-24 | Opportunity scoring (threshold-based "High opportunity" badge) | Samin | "High opportunity" badge |
| FR-25 | Manual ingestion trigger | Samin (in `news-ingestion-pipeline`) | admin-triggers-ui |

---

## Rules

1. One change = one branch = one owner. Never share a branch.
2. Never push directly to `main`. PR → 1 approval → squash merge.
3. Merge branches the same day you open the PR — don't let them age.
4. Pull + rebase every morning: `git checkout main && git pull --rebase origin main`
5. Async standup daily: post which branch you're on so nobody overlaps.
6. Update your row's Status column here whenever it changes.
