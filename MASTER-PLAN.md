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

## Independence Strategy

| Developer | How they stay unblocked |
|-----------|------------------------|
| **Samin** | Fully independent — owns the whole backend stack |
| **Robayat** | Independent — analytics + API contract; only needs Samin's `.env` values on Day 1 |
| **Mehedi** | Uses **hardcoded mock data** for all UI from Day 1 — zero dependency on backend. Swaps to real API on Day 3. |

> **The trick:** Mehedi never waits. Build every screen with realistic mock JSON. When Robayat's API contract is live, swap `mockData` → `fetch('/api/...')` in one pass.

---

## July 13 (Today) — Foundation

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `backend-scaffold` | `feat/backend-scaffold` | ⬜ Todo | Node + TS, Mongo/Redis, OpenRouter. Do this first — everyone needs it. |
| **Samin** | `db-vector-indexes` | `feat/db-vector-indexes` | ⬜ Todo | 3 Atlas Vector Search indexes + collection schemas |
| **Robayat** | `api-contract-openapi` | `feat/api-contract-openapi` | ⬜ Todo | REST endpoints + stub server so Mehedi can build immediately |
| **Robayat** | `platform-api-credentials` | `feat/platform-api-credentials` | ⬜ Todo | Meta / YouTube / LinkedIn tokens. Start LinkedIn NOW — slowest approval. |
| **Mehedi** | `news-feed-dashboard` | `feat/news-feed-dashboard` | ⬜ Todo | daily.dev-style feed, tabs, sort, trend + "High opportunity" badges — mock data |
| **Mehedi** | `content-generator-ui` | `feat/content-generator-ui` | ⬜ Todo | Generate button → 5 format panels, copy-to-clipboard — mock data |

---

## July 14 — Core Features

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `news-ingestion-pipeline` | `feat/news-ingestion-pipeline` | ⬜ Todo | HackerNews, Dev.to, GitHub, Reddit, RSS fetchers; 3h cron |
| **Samin** | `filter-pipeline` | `feat/filter-pipeline` | ⬜ Todo | 4 layers: keyword → vector dedup → Redis cache → relevance gate |
| **Robayat** | `facebook-analytics` | `feat/facebook-analytics` | ⬜ Todo | Meta Graph API: reach, engagement, top posts, best times; 6h refresh |
| **Robayat** | `youtube-analytics` | `feat/youtube-analytics` | ⬜ Todo | YouTube Data API v3: views, watch time, CTR, top videos |
| **Robayat** | `linkedin-analytics` | `feat/linkedin-analytics` | ⬜ Todo | LinkedIn API: impressions, engagement, demographics |
| **Mehedi** | `report-ui` | `feat/report-ui` | ⬜ Todo | 30-day report: overview, per-platform charts, AI insight — mock data |
| **Mehedi** | `chat-ui` | `feat/chat-ui` | ⬜ Todo | Ask Growth Studio chat panel — mock data |
| **Mehedi** | `admin-triggers-ui` | `feat/admin-triggers-ui` | ⬜ Todo | "Run ingestion" + "Refresh analytics" buttons — mock data |

---

## July 15 — AI Layer + Wire Up

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `ai-categorization-scoring` | `feat/ai-categorization-scoring` | ⬜ Todo | Batched LLM categorize + relevance + trend_score math |
| **Samin** | `brand-voice-rag` | `feat/brand-voice-rag` | ⬜ Todo | Seed brand_voice_examples, embed, vectorSearch few-shot |
| **Samin** | `content-generator` | `feat/content-generator` | ⬜ Todo | 5 formats: FB post, Reel, LinkedIn, YouTube idea, caption |
| **Robayat** | `opportunity-scoring` | `feat/opportunity-scoring` | ⬜ Todo | Embed posts → vectorSearch → opportunity_score = trend × audience |
| **Robayat** | `cross-platform-report` | `feat/cross-platform-report` | ⬜ Todo | Unified 30-day report + AI insight + content-opportunity ranking |
| **Mehedi** | `api-wiring` | `feat/api-wiring` | ⬜ Todo | Swap all mock data → real `fetch()` calls across every UI screen |

---

## July 16 — Integration + Demo

| Developer | Change | Branch | Status | Notes |
|-----------|--------|--------|--------|-------|
| **Samin** | `ask-growth-studio-chat` | `feat/ask-growth-studio-chat` | ⬜ Todo | RAG chat: embed query → vectorSearch → grounded Banglish answer |
| **Samin** | Integration testing | — | ⬜ Todo | Verify ingestion → scoring → generation pipeline end-to-end |
| **Robayat** | Integration testing | — | ⬜ Todo | Verify analytics data flows into Mehedi's report-ui correctly |
| **Mehedi** | UI polish | — | ⬜ Todo | Loading states, error handling, empty states, responsive check |
| **Mehedi** | Demo run-through | — | ⬜ Todo | Full happy-path walkthrough with team |

---

## Feature Coverage Map

| FR | Feature | Backend (owner) | Frontend (Mehedi) |
|----|---------|----------------|-------------------|
| FR-01 | News ingestion | Samin | news-feed-dashboard |
| FR-02, FR-04 | Filter pipeline | Samin | (internal, no UI) |
| FR-03 | AI categorization | Samin | trend badges in feed |
| FR-05 | Trend feed | Samin | news-feed-dashboard |
| FR-06 | Facebook analytics | Robayat | report-ui |
| FR-07 | YouTube analytics | Robayat | report-ui |
| FR-08 | LinkedIn analytics | Robayat | report-ui |
| FR-09–12 | Cross-platform report | Robayat | report-ui |
| FR-13–17, FR-19–21 | Content generator | Samin | content-generator-ui |
| FR-18 | Brand voice RAG | Samin | (internal) |
| FR-22, FR-23 | Ask Growth Studio chat | Samin | chat-ui |
| FR-24 | Opportunity scoring | Robayat | "High opportunity" badge |
| FR-25 | Manual ingestion trigger | Samin | admin-triggers-ui |
| FR-26 | Manual analytics refresh | Robayat | admin-triggers-ui |

---

## Rules

1. One change = one branch = one owner. Never share a branch.
2. Never push directly to `main`. PR → 1 approval → squash merge.
3. Merge branches the same day you open the PR — don't let them age.
4. Pull + rebase every morning: `git checkout main && git pull --rebase origin main`
5. Async standup daily: post which branch you're on so nobody overlaps.
6. Update your row's Status column here whenever it changes.
