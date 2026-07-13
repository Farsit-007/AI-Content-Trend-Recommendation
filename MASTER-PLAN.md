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
| 3 | ⬜ | Platform tokens require **Mursalin** (page admin — not on the dev team) | Robayat | Ping Mursalin TODAY; submit LinkedIn app first (slowest approval) |

---

## Independence Strategy

| Developer | How they stay unblocked |
|-----------|------------------------|
| **Samin** | Fully independent — owns the whole backend stack |
| **Robayat** | Independent — analytics + API contract; only needs Samin's `.env` values on Day 1 |
| **Mehedi** | Uses **hardcoded mock data** for all UI from Day 1 — zero dependency on backend. Swaps to real API on Day 3 behind a `USE_MOCK` flag. |

> **The trick:** Mehedi never waits. Build every screen with realistic mock JSON. When Robayat's API contract is live, swap `mockData` → `fetch('/api/...')` in one pass — but **keep the mocks as the demo-day fallback**.

---

## July 13 (Today) — Foundation

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | ⚡ Critical fixes #1 + #2 | — | ✅ Done | Atlas cluster + `$vectorSearch` confirmed live; OpenRouter confirmed as embedding provider (`openai/text-embedding-3-small`) |
| **Samin** | `backend-scaffold` | `ravi/feat/backend-scaffold` | ✅ Done | Node + TS, Mongo/Redis, OpenRouter LLM + embeddings client, env config, startup connectivity check — implemented and live-verified (typecheck, `npm run dev` connects to Atlas/Redis/OpenRouter). Merged to `main` via PR #6. |
| **Samin** | `db-vector-indexes` | `ravi/feat/db-vector-indexes` | 👀 In Review | 3 Atlas Vector Search indexes + collection schemas — implemented, live-verified against Atlas M0, PR #10 open |

| **Robayat** | ⚡ Critical fix #3 | — | ⬜ Todo | Ping Mursalin for tokens; submit LinkedIn app NOW |
| **Robayat** | `api-contract-openapi` | `feat/api-contract-openapi` | 🔄 In Progress | OpenAPI 3.1 contract for all `/api/v1` resources — Swagger UI at `/api/v1/docs`, raw spec at `/api/v1/openapi.json`. Implemented + verified locally (typecheck/lint clean, spec validates, UI renders). Pending PR → merge so Mehedi builds against it. |
| **Robayat** | `platform-api-credentials` | `feat/platform-api-credentials` | ⬜ Todo | Meta / YouTube / LinkedIn app setup + tokens → `.env` |
| **Mehedi** | `news-feed-dashboard` | `feat/news-feed-dashboard` | ⬜ Todo | daily.dev-style feed, tabs, sort, trend + "High opportunity" badges — mock data |
| **Mehedi** | `content-generator-ui` | `feat/content-generator-ui` | ⬜ Todo | Generate button → 5 format panels, copy-to-clipboard — mock data |

---

## July 14 — Core Features

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `news-ingestion-pipeline` | `feat/news-ingestion-pipeline` | ⬜ Todo | HackerNews, Dev.to, GitHub, Reddit, RSS; 3h cron. **Includes FR-25 manual trigger endpoint.** |
| **Samin** | `filter-pipeline` | `feat/filter-pipeline` | ⬜ Todo | 4 layers: keyword → vector dedup → Redis cache → relevance gate |
| **Samin** | `brand-voice-rag` | `feat/brand-voice-rag` | ⬜ Todo | Moved up from Jul 15 — only needs indexes. Seed data comes from Mehedi today. |
| **Robayat** | `facebook-analytics` | `feat/facebook-analytics` | ⬜ Todo | Meta Graph API; 6h refresh. **Includes FR-26 manual refresh endpoint.** Start here — slowest API. |
| **Robayat** | `youtube-analytics` | `feat/youtube-analytics` | ⬜ Todo | YouTube Data API v3: views, watch time, CTR, top videos |
| **Robayat** | `linkedin-analytics` | `feat/linkedin-analytics` | ⬜ Todo | **Cut first if behind** (FR-08 Should Have; approval may not arrive) |
| **Mehedi** | `report-ui` | `feat/report-ui` | ⬜ Todo | 30-day report: overview, per-platform charts, AI insight — mock data |
| **Mehedi** | `chat-ui` | `feat/chat-ui` | ⬜ Todo | Ask Growth Studio chat panel — mock data |
| **Mehedi** | `admin-triggers-ui` | `feat/admin-triggers-ui` | ⬜ Todo | "Run ingestion" + "Refresh analytics" buttons — mock data |
| **Mehedi** | Brand-voice seed posts | — | ⬜ Todo | Collect 25–30 real high-engagement posts (needs Mursalin) — unblocks Samin's RAG |

---

## July 15 — AI Layer + Wire Up

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `ai-categorization-scoring` | `feat/ai-categorization-scoring` | ⬜ Todo | Batched LLM categorize + relevance + trend_score math + impact note |
| **Samin** | `content-generator` | `feat/content-generator` | ⬜ Todo | 5 formats: FB post, Reel, LinkedIn, YouTube idea, caption |
| **Samin** | `ask-growth-studio-chat` | `feat/ask-growth-studio-chat` | ⬜ Todo | Moved up from Jul 16. **Cut second if behind** (FR-22/23 Should Have) |
| **Robayat** | `opportunity-scoring` | `feat/opportunity-scoring` | ⬜ Todo | Embed posts → vectorSearch → opportunity_score = trend × audience |
| **Robayat** | `cross-platform-report` | `feat/cross-platform-report` | ⬜ Todo | Unified 30-day report + AI insight + content-opportunity ranking |
| **Mehedi** | `api-wiring` | `feat/api-wiring` | ⬜ Todo | Swap mocks → real `fetch()` behind a `USE_MOCK` flag. **Do NOT delete the mock folder** — it's the demo fallback. |

---

## July 16 — Integration + Demo (NO feature work)

| Developer | Work | Status | Notes |
|-----------|------|--------|-------|
| **Samin** | Integration testing | ⬜ Todo | Ingestion → scoring → generation end-to-end |
| **Robayat** | Integration testing | ⬜ Todo | Analytics → report-ui data flow |
| **Mehedi** | UI polish + demo script | ⬜ Todo | Loading/error/empty states, responsive check, demo walkthrough script |
| **All** | Demo prep | ⬜ Todo | Run ingestion, pre-warm demo topics into Redis, warm app 5 min before presenting (NFR-12) |

---

## Descope Order (pre-agreed — no debates at 11pm)

1. **Cut first:** `linkedin-analytics` — FR-08 Should Have; fallback already documented
2. **Cut second:** `ask-growth-studio-chat` + `chat-ui` — FR-22/23 Should Have; demo survives without it
3. **Never cut:** news feed, content generator, cross-platform report — these ARE the demo

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
| FR-03 | AI categorization + impact note | Samin | trend badges in feed |
| FR-05 | Trend feed | Samin | news-feed-dashboard |
| FR-06 | Facebook analytics | Robayat | report-ui |
| FR-07 | YouTube analytics | Robayat | report-ui |
| FR-08 | LinkedIn analytics | Robayat | report-ui |
| FR-09–12 | Cross-platform report | Robayat | report-ui |
| FR-13–17, FR-19–21 | Content generator | Samin | content-generator-ui |
| FR-18 | Brand voice RAG | Samin | (internal) |
| FR-22, FR-23 | Ask Growth Studio chat | Samin | chat-ui |
| FR-24 | Opportunity scoring | Robayat | "High opportunity" badge |
| FR-25 | Manual ingestion trigger | Samin (in `news-ingestion-pipeline`) | admin-triggers-ui |
| FR-26 | Manual analytics refresh | Robayat (in `facebook-analytics`) | admin-triggers-ui |

---

## Rules

1. One change = one branch = one owner. Never share a branch.
2. Never push directly to `main`. PR → 1 approval → squash merge.
3. Merge branches the same day you open the PR — don't let them age.
4. Pull + rebase every morning: `git checkout main && git pull --rebase origin main`
5. Async standup daily: post which branch you're on so nobody overlaps.
6. Update your row's Status column here whenever it changes.
