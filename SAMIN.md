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
| 🔄 In Progress | `backend-scaffold` | `ravi/feat/backend-scaffold` | Node + TS server, Mongo/Redis, OpenRouter LLM + embeddings client (via `openai` SDK), env config, startup connectivity check. Implemented and live-verified end-to-end (typecheck passes; `npm run dev` connects to Atlas/Redis/OpenRouter and logs `OK` for all four checks; a broken env var exits with a clear error). **Not yet committed/PR'd to `main`.** |
| ⬜ Todo | `db-vector-indexes` | `feat/db-vector-indexes` | 3 Atlas Vector Search indexes + collection schemas |

### July 14 — Ingestion Pipeline + Brand Voice
| Status | Change | Branch | FRs | Notes |
|--------|--------|--------|-----|-------|
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
- Share your `.env` values (Mongo URI, Redis URL, OpenRouter key) with Robayat as soon as scaffold is done — that's the only handoff. **Scaffold is functionally done and live-verified — share the values now; still pending: commit/PR/merge `ravi/feat/backend-scaffold` to `main`.**
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
