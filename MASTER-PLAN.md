# Growth Studio — Master Plan
**Deadline: July 16, 2026** · 3 developers · 4 days

---

## Independence Strategy

| Developer | How they stay unblocked |
|-----------|------------------------|
| **Samin** | Fully independent — owns the whole backend stack |
| **Robayat** | Independent — analytics + API contract; only needs Samin's `.env` values on Day 1 |
| **Mehedi** | Uses **hardcoded mock data** for all UI from Day 1 — zero dependency on backend. Swaps to real API on Day 3. |

> **The trick:** Mehedi never waits. Build every screen with realistic mock JSON. When Robayat's API contract is live, swap `mockData` → `fetch('/api/...')` in one pass.

---

## Day-by-Day Schedule

### July 13 (Today) — Foundation

| Developer | Tasks |
|-----------|-------|
| **Samin** | `backend-scaffold` → `db-vector-indexes` |
| **Robayat** | `api-contract-openapi` (stub server) + `platform-api-credentials` (start LinkedIn approval now — slowest) |
| **Mehedi** | `news-feed-dashboard` + `content-generator-ui` — **all with mock data** |

### July 14 — Core Features

| Developer | Tasks |
|-----------|-------|
| **Samin** | `news-ingestion-pipeline` → `filter-pipeline` |
| **Robayat** | `facebook-analytics` → `youtube-analytics` → `linkedin-analytics` |
| **Mehedi** | `report-ui` + `chat-ui` + `admin-triggers-ui` — **all with mock data** |

### July 15 — AI Layer + Wire Up

| Developer | Tasks |
|-----------|-------|
| **Samin** | `ai-categorization-scoring` → `brand-voice-rag` → `content-generator` |
| **Robayat** | `opportunity-scoring` → `cross-platform-report` |
| **Mehedi** | **Swap all mock data → real API calls** across every UI screen |

### July 16 — Integration + Demo

| Developer | Tasks |
|-----------|-------|
| **Samin** | `ask-growth-studio-chat` + integration testing |
| **Robayat** | Final report polish + integration testing |
| **Mehedi** | UI polish, loading states, error handling + demo run-through |

---

## Feature Coverage Map

| FR | Feature | Backend (owner) | Frontend (Mehedi) |
|----|---------|----------------|-------------------|
| FR-01 | News ingestion | Samin | news-feed-dashboard |
| FR-02, FR-04 | Filter pipeline | Samin | (internal, no UI) |
| FR-03 | AI categorization | Samin | trend 🔥 badges in feed |
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

## Branch State

```
main (protected)
 ├─ feat/backend-scaffold          → Samin   (Jul 13)
 ├─ feat/db-vector-indexes         → Samin   (Jul 13)
 ├─ feat/api-contract-openapi      → Robayat (Jul 13)
 ├─ feat/platform-api-credentials  → Robayat (Jul 13)
 ├─ feat/news-feed-dashboard       → Mehedi  (Jul 13)
 ├─ feat/content-generator-ui      → Mehedi  (Jul 13)
 ├─ feat/news-ingestion-pipeline   → Samin   (Jul 14)
 ├─ feat/filter-pipeline           → Samin   (Jul 14)
 ├─ feat/facebook-analytics        → Robayat (Jul 14)
 ├─ feat/youtube-analytics         → Robayat (Jul 14)
 ├─ feat/linkedin-analytics        → Robayat (Jul 14)
 ├─ feat/report-ui                 → Mehedi  (Jul 14)
 ├─ feat/chat-ui                   → Mehedi  (Jul 14)
 ├─ feat/admin-triggers-ui         → Mehedi  (Jul 14)
 ├─ feat/ai-categorization-scoring → Samin   (Jul 15)
 ├─ feat/brand-voice-rag           → Samin   (Jul 15)
 ├─ feat/content-generator         → Samin   (Jul 15)
 ├─ feat/opportunity-scoring       → Robayat (Jul 15)
 ├─ feat/cross-platform-report     → Robayat (Jul 15)
 └─ feat/ask-growth-studio-chat      → Samin   (Jul 16)
```

---

## Rules

1. One change = one branch = one owner. Never share a branch.
2. Never push directly to `main`. PR → 1 approval → squash merge.
3. Merge branches the same day you open the PR — don't let them age.
4. Pull + rebase every morning: `git checkout main && git pull --rebase origin main`
5. Async standup daily: post which branch you're on so nobody overlaps.
