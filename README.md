# TrendBridge

> **AI Content & Trend Intelligence Platform** — combines what's trending in tech with what works on *your* channels, and turns it into a full week of content across Facebook, YouTube, and LinkedIn in 5 minutes. Zero AI cost, zero API cost.

**Team Next Wave** · Hackathon topic: *AI Content & Trend Recommendation* · Jul 12–18, 2026

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [System Architecture](#system-architecture)
- [Subsystems](#subsystems)
- [Key Data Flows](#key-data-flows)
- [Data Model](#data-model)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
- [Requirements Traceability](#requirements-traceability)
- [Out of Scope](#out-of-scope-phase-2)
- [Team](#team)

---

## The Problem

The Programming Hero marketing team runs content across **Facebook, YouTube, and LinkedIn** at once, and hits four compounding problems:

1. **No visibility into trends** — hours wasted manually browsing HackerNews, Dev.to, Twitter.
2. **No understanding of their own audience** — no single view of what performed and when to post.
3. **Slow, inconsistent content creation** — every platform needs a different tone; they can't keep up.
4. **No link between trends and their data** — a globally trending topic ≠ a topic *their* followers care about.

## The Solution

TrendBridge is a marketing-intelligence platform that does four things:

| # | Capability | What it does |
|---|-----------|--------------|
| 1 | **Monitor** | Pulls tech trends 24/7 from HackerNews, Dev.to, GitHub, Reddit, RSS |
| 2 | **Analyze** | Pulls 30 days of Facebook, YouTube, and LinkedIn performance |
| 3 | **Cross-reference** | Ranks content ideas by *trend score × your audience match* |
| 4 | **Generate** | One click → FB post, Reel script, LinkedIn post, YouTube idea, caption — in Banglish, in your brand voice |

---

## System Architecture

TrendBridge is a **monorepo** with three logical planes: two unattended background pipelines that keep data fresh, and an on-demand serving layer that powers the dashboard.

```mermaid
flowchart TB
    subgraph Sources["External Sources (free)"]
        HN[HackerNews]; DEV[Dev.to]; GH[GitHub / OSS Insight]
        RD[Reddit]; RSS[RSS Feeds]
        FB[(Meta Graph API)]; YT[(YouTube Data API)]; LI[(LinkedIn API)]
    end

    subgraph Ingest["News Ingestion Pipeline · every 3h"]
        FETCH[Fetchers] --> F1[L1 Keyword pre-filter]
        F1 --> F2[L2 Vector dedup]
        F2 --> F3[L3 Redis cache check]
        F3 --> F4[L4 Relevance gate]
        F4 --> CAT[AI categorize + score]
        F4 --> TS[Trend score · math, no AI]
    end

    subgraph Analytics["Analytics Pipeline · every 6h"]
        ACOL[Platform collectors] --> ANORM[Normalize + embed posts]
    end

    subgraph Data["Data & Infra"]
        MONGO[(MongoDB Atlas M0<br/>+ Vector Search)]
        REDIS[(Redis cache)]
        OR{{OpenRouter<br/>LLM + embeddings · free}}
    end

    subgraph Serve["Backend API (on demand)"]
        FEED[News feed]; GEN[Content generator]
        REP[Report generator]; CHAT[Ask TrendBridge]
        ADMIN[Admin triggers]
    end

    subgraph FE["Frontend · Next.js 16"]
        DASH[Dashboard / Feed]; CGEN[Content UI]
        RPT[Report UI]; ASK[Chat UI]
    end

    HN & DEV & GH & RD & RSS --> FETCH
    FB & YT & LI --> ACOL
    CAT --> MONGO; TS --> MONGO; ANORM --> MONGO
    F2 -. $vectorSearch .-> MONGO
    F3 <--> REDIS
    CAT --> OR; ANORM --> OR
    Serve <--> MONGO; Serve <--> REDIS; GEN & REP & CHAT --> OR
    FE <--> Serve
    ADMIN -.manual run.-> Ingest
    ADMIN -.manual run.-> Analytics
```

**Design principle running through everything:** *AI is used only where it adds value.* Cheap string matching, vector dedup, Redis caching, and pure-math scoring gate the expensive LLM calls, keeping cost at **$0** as volume scales.

---

## Subsystems

### 1. News Ingestion Pipeline (every 3h, unattended)
Fetches from 5+ free sources, then runs the **4-layer AI-cost filter** that reduces 200+ raw items to the 20–30 that matter *before any LLM runs*:

| Layer | Check | Cost |
|------|-------|------|
| **L1 — Keyword pre-filter** | Drop items with no PH-relevant keywords | Zero (string match) |
| **L2 — Vector dedup** | 768-dim embedding → `$vectorSearch`; cosine > 0.9 = duplicate | Embedding only |
| **L3 — Redis cache** | `SHA256(title+url)` seen in last 24h → skip | Zero |
| **L4 — Relevance gate** | LLM scores 1–10; < 4 stored but never surfaced | LLM (survivors only) |

Survivors get **AI categorization** (batched 10/call) and a **trend score** computed by pure math:

```
trend_score = normalize(points,500)×4 + normalize(comments,200)×3 + recency_decay×3
recency_decay = max(0, 1 − hoursOld/48)     # 🔥 badge when score ≥ 7
```

### 2. Analytics Pipeline (every 6h, unattended)
Pulls 30 days from **Meta Graph API** (FB), **YouTube Data API v3**, and **LinkedIn API** — reach, engagement, top posts, best times, format breakdown — into `platform_analytics`, and embeds individual posts into `platform_posts` for opportunity scoring.

### 3. Serving / API Layer (on demand)
- **News feed** — filter by category, sort by latest/relevance/trend, "High opportunity" badges
- **Content generator** — lazy (fires on click), 5 formats, Brand Voice RAG, cached 24h
- **Report generator** — unified 30-day cross-platform report with AI insight
- **Ask TrendBridge** — natural-language RAG chat grounded in real data
- **Admin triggers** — manually run ingestion / analytics refresh (demo tooling)

### 4. Frontend (Next.js 16)
daily.dev-style dark dashboard: card feed with tabs, one-click generation, report view, chat.

---

## Key Data Flows

**Four RAG flows over three MongoDB Atlas vector indexes** (`news_items.embedding`, `brand_voice_examples.embedding`, `platform_posts.embedding` — all 768-dim, cosine):

| Flow | Trigger | Path |
|------|---------|------|
| **Semantic dedup** | Ingestion | embed → `$vectorSearch news_items` limit 1 → score > 0.9 = skip |
| **Ask TrendBridge** | User question | embed query → `$vectorSearch news_items` limit 5 → LLM → Banglish answer |
| **Brand Voice RAG** | Generate click | embed topic → `$vectorSearch brand_voice_examples` limit 3 → few-shot into prompt |
| **Opportunity scoring** | Cross-reference | embed trend → `$vectorSearch platform_posts` limit 10 → `opportunity_score = trend_score × avg_engagement_of_similar_posts` |

Content generation end to end:

```mermaid
sequenceDiagram
    participant U as User
    participant API as Backend
    participant R as Redis
    participant M as MongoDB Atlas
    participant O as OpenRouter

    U->>API: Click "Generate Content" on a news card
    API->>R: Cached result? (news_id)
    alt cache hit
        R-->>API: 5 formats
    else cache miss
        API->>M: embed(title) → $vectorSearch brand_voice_examples (3)
        M-->>API: 3 real high-engagement posts (few-shot)
        API->>O: prompt + few-shot + audience patterns
        O-->>API: FB post, Reel, LinkedIn, YouTube idea, caption
        API->>R: cache 24h
    end
    API-->>U: 5 Banglish formats (copy to clipboard)
```

---

## Data Model

MongoDB collections (see [`project-ida-requirments.md`](./project-ida-requirments.md) §5.8 for full field lists):

| Collection | Purpose | Vector index |
|-----------|---------|:---:|
| `news_items` | Ingested + enriched news (trend/relevance/impact) | ✅ |
| `platform_analytics` | Per-platform 30-day rollups | — |
| `platform_posts` | Individual posts + embeddings for opportunity scoring | ✅ |
| `generated_content` | Cached multi-format generations | — |
| `brand_voice_examples` | 25–30 real posts seeded as few-shot voice | ✅ |
| `reports` | Cross-platform 30-day reports | — |

---

## Tech Stack

| Layer | Choice | Notes |
|------|--------|------|
| **Frontend** | Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4, shadcn/ui | Dark-first, mobile responsive |
| **Backend** | *Node.js + TypeScript service* (to be built in `backend/`) | REST + OpenAPI spec |
| **Database** | MongoDB Atlas M0 + Atlas Vector Search | 3 vector indexes, free tier |
| **Cache** | Redis | Dedup keys, generation & report caching |
| **AI** | OpenRouter free tier | LLMs + `nomic-embed-text` embeddings |
| **Scheduling** | Cron jobs | Ingestion 3h, analytics 6h |

**AI models (all OpenRouter free tier):** `meta-llama/llama-3.1-8b-instruct:free` (categorization, report, chat), `mistralai/mistral-7b-instruct:free` (content generation), `google/gemma-2-9b-it:free` (fallback), `nomic-ai/nomic-embed-text` (embeddings).

> **Cost targets:** $0 AI + $0 platform API. Feed loads < 1.5s cached, generation < 10s, chat < 6s, report < 15s. See requirements §5 (NFRs).

---

## Repository Layout

```
AI-Content-Trend-Recommendation/
├─ frontend/                    # Next.js 16 app (landing + dashboard)
│  ├─ app/                      # routes (App Router)
│  └─ components/landing/       # landing-page sections
├─ backend/                     # API + ingestion + analytics pipelines (in progress)
├─ openspec/                    # spec-driven change management
│  ├─ changes/<name>/           # one folder per proposed change
│  └─ config.yaml
├─ project-ida-requirments.md   # full product requirements (source of truth)
├─ SPEC-DRIVEN-WORKFLOW.md      # how the 3-dev team works without conflicts
├─ CLAUDE.md                    # AI assistant / contributor conventions
└─ README.md                    # you are here
```

---

## Getting Started

```bash
# Frontend
cd frontend && npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint

# Backend  (once scaffolded)
# cd backend && npm install && npm run dev
```

Required environment (backend `.env`, all free tiers): `MONGODB_URI`, `REDIS_URL`, `OPENROUTER_API_KEY`, `META_PAGE_ACCESS_TOKEN`, `YOUTUBE_API_KEY`, `LINKEDIN_*`.

> **New to the team?** Read [`SPEC-DRIVEN-WORKFLOW.md`](./SPEC-DRIVEN-WORKFLOW.md) before your first commit — it's how we avoid merge conflicts across 3 developers.

---

## Requirements Traceability

Full functional (FR-01…FR-26) and non-functional (NFR-01…NFR-12) requirements live in [`project-ida-requirments.md`](./project-ida-requirments.md) §5. Each OpenSpec change under `openspec/changes/` maps its specs back to these IDs.

## Out of Scope (Phase 2)

Auth & multi-workspace · auto-publishing · dedicated vector DB (Pinecone/Weaviate) · Slack/Discord notifications · A/B testing · paid-ad analytics · white-label.

---

## Team

**Next Wave** — Web Course Level-02

| Name | Role |
|------|------|
| Samin Israr Ravi | Developer |
| Mehedi Imun | Developer |
| Robayat Kalam Farsit | Developer |

> One-liner for judges: *"TrendBridge combines what's trending in tech with what works on YOUR channels — and generates a full week of content across Facebook, YouTube, and LinkedIn in 5 minutes, for free."*
