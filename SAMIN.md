# Samin Israr Ravi — Backend: Ingestion & AI Intelligence

**Role:** Backend lead — ingestion pipeline, AI categorization, content generation, RAG chat  
**Owns:** `backend/shared/**`, `backend/ingestion/**`, `backend/generation/**`, `backend/rag/**`  
**Deadline:** July 16, 2026

---

## Task Board

### ⚡ July 13 FIRST — Critical Architecture Fixes (before any code)
| Status | Task | Notes |
|--------|------|-------|
| ⬜ Todo | Fix MongoDB setup | `docker-compose.yml` uses `mongo:7-jammy` — **`$vectorSearch` is Atlas-only and will fail**. Either point `DATABASE_URL` at a real Atlas M0 cloud cluster or swap image to `mongodb/mongodb-atlas-local`. |
| ⬜ Todo | Verify embedding provider | OpenRouter may not serve an embeddings API. Test with one curl. Fallbacks: Gemini embedding free tier, Jina AI, Nomic Atlas API, local Ollama. **All 4 RAG flows depend on this.** |

### July 13 (Today) — Foundation
| Status | Change | Branch | Notes |
|--------|--------|--------|-------|
| ⬜ Todo | `backend-scaffold` | `feat/backend-scaffold` | Node + TS server, Mongo/Redis, LLM client, env config. **Do this first — everyone needs it.** |
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
- Share your `.env` values (Mongo URI, Redis URL, OpenRouter key) with Robayat as soon as scaffold is done — that's the only handoff.
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
