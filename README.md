# Growth Studio

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

Growth Studio is a marketing-intelligence platform that does four things:

| # | Capability | What it does |
|---|-----------|--------------|
| 1 | **Monitor** | Pulls tech trends 24/7 from HackerNews, Dev.to, GitHub, Reddit, RSS |
| 2 | **Analyze** | Pulls 30 days of Facebook, YouTube, and LinkedIn performance |
| 3 | **Cross-reference** | Ranks content ideas by *trend score × your audience match* |
| 4 | **Generate** | One click → FB post, Reel script, LinkedIn post, YouTube idea, caption — in Banglish, in your brand voice |

---

## System Architecture

Growth Studio is a **monorepo** with three logical planes: two unattended background pipelines that keep data fresh, and an on-demand serving layer that powers the dashboard.

```mermaid
flowchart TB
    subgraph Sources["External Sources (free)"]
        HN[HackerNews]; DEV[Dev.to]; GH[GitHub / OSS Insight]
        RD[Reddit]; RSS[RSS Feeds]
        FB[(Meta Graph API)]; YT[(YouTube Data API)]; LI[(LinkedIn API)]
    end

    subgraph Ingest["News Ingestion Pipeline · every 3h (cron) or on demand (admin)"]
        FETCH[Fetchers] --> F1[L1 Dedupe · content_hash + freshness]
        F1 --> F2[L2 Relevance · pooled brand-voice cosine sim]
        F2 --> F3[L3 Trend score · math, no AI]
        F2 --> F4[L4 AI categorize + opportunity score]
        F3 --> F4
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
        REP[Report generator]; CHAT[Ask Growth Studio]
        ADMIN[Admin triggers]
    end

    subgraph FE["Frontend · Vite + React 19"]
        DASH[Dashboard / Feed]; CGEN[Content UI]
        RPT[Report UI]; ASK[Chat UI]
    end

    HN & DEV & GH & RD & RSS --> FETCH
    FB & YT & LI --> ACOL
    CAT --> MONGO; TS --> MONGO; ANORM --> MONGO
    F1 <-. content_hash lookup .-> MONGO
    F2 -. brand_voice_examples pool .-> MONGO
    CAT --> OR; ANORM --> OR
    Serve <--> MONGO; Serve <--> REDIS; GEN & REP & CHAT --> OR
    FE <--> Serve
    ADMIN -.manual run.-> Ingest
    ADMIN -.manual run.-> Analytics
```

**Design principle running through everything:** *AI is used only where it adds value.* Cheap hash-based dedup and pure-math trend scoring gate the expensive LLM calls, keeping ingestion cost near **$0** as volume scales — the LLM only runs on items that survive dedup + relevance.

> **Built differently than originally planned (2026-07-14):** the ingestion pipeline that shipped uses exact `content_hash` dedup (not vector similarity) and has no Redis-cache layer or keyword pre-filter — see [`project-ida-requirments.md`](./project-ida-requirments.md)'s FR-02/FR-04 notes and `SAMIN.md` for the full deviation writeup. Redis is still used elsewhere (generation/report caching), just not in this pipeline.

---

## Subsystems

### 1. News Ingestion Pipeline (every 3h via cron, or on demand via admin trigger)
Fetches from 5 free sources (HackerNews, Dev.to, GitHub Trending, Reddit, RSS — each isolated so one failing source never kills the run), then runs a **4-layer pipeline**:

| Layer | Check | Cost |
|------|-------|------|
| **L1 — Dedupe + freshness** | Exact-match `content_hash` (SHA-256 of `source:url`) against MongoDB + already-seen-this-run; drop items older than `NEWS_INGESTION_MAX_AGE_HOURS` (default 72h) | Zero (hash + DB lookup, no embedding) |
| **L2 — Relevance gate** | Embed the item, score = max cosine similarity vs. the **pooled embeddings of every team's `BrandVoiceExample`**; drop if below `NEWS_INGESTION_MIN_RELEVANCE` (default 4.0) — *skipped entirely if no brand voice examples exist yet (cold start)* | Embedding only |
| **L3 — Trend score** | Pure math from source engagement, no AI | Zero |
| **L4 — AI categorize + opportunity score** | Batched LLM call (~10 items/call) assigns category, impact note, confidence (0-1), and audience fit (0-1); falls back to `category: 'Other'` + zero confidence on a malformed response. `opportunity_score` itself is **not** LLM-picked — it's computed deterministically from `relevance_score`, `trend_score`, and the LLM's audience-fit signal (see note below) | LLM (survivors only) |

Trend score is computed by pure math (no AI):

```
trend_score = min(10, log10(points + comments×2 + stars_delta×3 + 1) × 3)
```

> **Deviates from the original plan** (keyword pre-filter → vector dedup → Redis cache → relevance gate): this is exact-hash dedup, not vector/semantic similarity, so two different URLs covering the same story (e.g. the same launch on both HN and Dev.to) are **not** caught as duplicates — that was a deliberate hackathon-timeline scope call, not an oversight. See `SAMIN.md` and [`project-ida-requirments.md`](./project-ida-requirments.md) FR-02/FR-04 for the full write-up.

> **Extended 2026-07-14 (`ai-categorization-scoring`):** `opportunity_score` is no longer picked freely by the LLM — it's now computed in code as `W_RELEVANCE×relevance_score + W_TREND×trend_score + W_FIT×(audience_fit×10)` from a new bounded `audience_fit` (0-1) the LLM supplies alongside `category`, plus a new `confidence` (0-1) that drives a `needs_review` flag on low-confidence items. Teams can also define their own custom categories on top of the fixed default taxonomy and override an item's category/opportunity score for their own view — via a separate `news_item_category_overrides` collection, so the shared `news_items` document itself is never mutated and other teams never see the override. Full write-up in `SAMIN.md`.

### 2. Analytics Pipeline (every 6h, unattended)
Pulls 30 days from **Meta Graph API** (FB), **YouTube Data API v3**, and **LinkedIn API** — reach, engagement, top posts, best times, format breakdown — into `platform_analytics`, and embeds individual posts into `platform_posts` for opportunity scoring.

### 3. Serving / API Layer (on demand)
- **News feed** — filter by category (fixed defaults + each team's own custom categories), sort by latest/relevance/trend, "High opportunity"/"Needs review" badges, per-team recategorize + opportunity-score override
- **Content generator** — lazy (fires on click), 5 formats, Brand Voice RAG *(built without the 24h cache — see deviation note below)*
- **Report generator** — unified 30-day cross-platform report with AI insight
- **Ask Growth Studio** — natural-language RAG chat grounded in real data
- **Admin triggers** — manually run ingestion / analytics refresh (demo tooling)

### 4. Frontend (Vite + React 19)
daily.dev-style dark dashboard: card feed with tabs, one-click generation, report view, chat.

---

## Key Data Flows

**Four RAG flows over three MongoDB Atlas vector indexes** (`news_items.embedding`, `brand_voice_examples.embedding`, `platform_posts.embedding` — all 768-dim, cosine):

| Flow | Trigger | Path |
|------|---------|------|
| **Dedup** *(not the vector flow originally planned — built as exact-match instead, see note above)* | Ingestion | `content_hash` (SHA-256 of `source:url`) checked against MongoDB — no embedding, no `$vectorSearch` |
| **Relevance gate** | Ingestion | embed item → cosine similarity vs. pooled `BrandVoiceExample` embeddings (in-memory, not `$vectorSearch`) → max score, or skip filtering entirely if the pool is empty |
| **Ask Growth Studio** | User question | embed query → `$vectorSearch news_items` limit 5 → LLM → Banglish answer |
| **Brand Voice RAG** *(built differently — see note below)* | Generate click | embed topic → **in-app cosine similarity** (not `$vectorSearch`) over the *requesting team's own* `brand_voice_examples` (top 3) **and** top-performing `platform_posts` (top 3) → few-shot into a single structured-JSON prompt |
| **Opportunity scoring** | Cross-reference | embed trend → `$vectorSearch platform_posts` limit 10 → `opportunity_score = trend_score × avg_engagement_of_similar_posts` |

> **Built differently than originally planned (2026-07-14):** `brand-voice-rag` (`POST /content/generate`, `backend/src/app/modules/ContentGeneration/`) shipped as a deliberate, confirmed-with-the-user scope cut from the row above and the sequence diagram below — see `SAMIN.md` for the full write-up:
> - Retrieval is **team-scoped, in-app cosine similarity** (mirroring the existing `newsIngestion.scoring.ts` pattern), not an Atlas `$vectorSearch` aggregation — per-team pools are small enough that the extra complexity isn't worth it yet.
> - Grounding draws on **two sources**, not one: `brand_voice_examples` (top 3 by similarity) *and* the team's top-performing `platform_posts` (top 20 by engagement, then top 3 of those by similarity) — not just `brand_voice_examples`.
> - **Cold start** (a team with zero `brand_voice_examples`) skips all few-shot retrieval and falls back to a generic brand-neutral prompt, rather than borrowing another team's examples.
> - **No Redis caching, no `generated_content` collection** — this is a stateless generate-and-return endpoint; a history/caching feature is a separate future change, not built here.
> - All 5 formats come from **one structured-JSON LLM call**, not 5 separate calls.

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

> This diagram reflects the **original plan**, not what shipped — no Redis cache step and a different retrieval mechanism/sources exist in the real implementation. See the deviation note above.

---

## Data Model

MongoDB collections (see [`project-ida-requirments.md`](./project-ida-requirments.md) §5.8 for full field lists):

| Collection | Purpose | Vector index |
|-----------|---------|:---:|
| `news_items` | Ingested + enriched news (trend/relevance/impact/confidence/needs_review) — global, not team-scoped | ✅ |
| `news_item_category_overrides` | Per-team override of a `news_items` document's `category`/`opportunity_score` (`news_item_id` + `team_id` unique) — merged into reads for the requesting team only, never mutates the shared item | — |
| `platform_analytics` | Per-platform 30-day rollups | — |
| `platform_posts` | Individual posts + embeddings for opportunity scoring — scoped per team (`team_id`) | ✅ |
| `generated_content` | *(not built — `brand-voice-rag` shipped as a stateless endpoint, no generation history/cache; see deviation note in [Key Data Flows](#key-data-flows))* | — |
| `brand_voice_examples` | 25–30 real posts seeded as few-shot voice — scoped per team (`team_id`) | ✅ |
| `reports` | Cross-platform 30-day reports | — |

**Auth / multi-team collections** (built 2026-07-14, backend only — see [Out of Scope](#out-of-scope-phase-2)):

| Collection | Purpose |
|-----------|---------|
| `users` | Accounts; `role: 'super_admin' \| 'admin' \| 'user'`. No public self-registration — admins/super_admins create every account (`POST /users`), plus a `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`-driven bootstrap on server start |
| `teams` | Growth teams (many-to-many membership with `users` via `team_memberships`); `custom_categories: string[]` lets each team extend the fixed default news-category taxonomy |
| `team_memberships` | Join collection: which users belong to which teams |
| `platform_catalog` | super_admin-curated list of social platforms that exist in the system at all, each with a global enable/disable switch |
| `team_platforms` | Each team's own on/off switch for a catalog platform — must be enabled here (and globally) before the team can add a credential for it |
| `platform_credentials` | Per-team, AES-256-GCM-encrypted social platform tokens (any platform slug, not just Facebook/YouTube/LinkedIn) |

---

## Tech Stack

| Layer | Choice | Notes |
|------|--------|------|
| **Frontend** | Vite + React 19, TypeScript, Tailwind CSS v4, React Router v7 | Dark-first, mobile responsive |
| **Backend** | Node.js + TypeScript (in `backend/`) | REST + OpenAPI spec; JWT auth, roles (`user`/`admin`/`super_admin`), multi-team data isolation |
| **Database** | MongoDB Atlas M0 + Atlas Vector Search | 3 vector indexes, free tier |
| **Cache** | Redis | Dedup keys, report caching *(generation caching not built — `brand-voice-rag` is a stateless endpoint, see [Key Data Flows](#key-data-flows))* |
| **AI** | OpenRouter free tier | LLMs + `nomic-embed-text` embeddings |
| **Scheduling** | Cron jobs | Ingestion 3h, analytics 6h |

**AI models (all OpenRouter free tier):** `meta-llama/llama-3.1-8b-instruct:free` (categorization, report, chat), `mistralai/mistral-7b-instruct:free` (content generation), `google/gemma-2-9b-it:free` (fallback), `nomic-ai/nomic-embed-text` (embeddings).

> **Cost targets:** $0 AI + $0 platform API. Feed loads < 1.5s cached, generation < 10s, chat < 6s, report < 15s. See requirements §5 (NFRs).

---

## Repository Layout

```
AI-Content-Trend-Recommendation/
├─ frontend/                    # Vite + React 19 app (landing + dashboard)
│  ├─ src/pages/                # route components
│  └─ src/components/landing/   # landing-page sections
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
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm run lint         # eslint

# Backend
cd backend && npm install
npm run dev              # http://localhost:3001, docs at /api/v1/docs
npm run typecheck
npm run lint
npm run seed:admin -- <email> <password> <name> [admin|super_admin]   # bootstrap an account manually
```

Required environment (backend `.env` — copy from `.env.example`, all free tiers): `DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`. Optional: `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` (auto-seeds a super_admin on server start if that account doesn't exist yet), plus per-platform bootstrap vars (`FB_PAGE_TOKEN`, `YOUTUBE_API_KEY`, `LINKEDIN_TOKEN`, …) as a fallback for teams that haven't submitted their own credential yet.

> **New to the team?** Read [`SPEC-DRIVEN-WORKFLOW.md`](./SPEC-DRIVEN-WORKFLOW.md) before your first commit — it's how we avoid merge conflicts across 3 developers.

---

## Requirements Traceability

Full functional (FR-01…FR-26) and non-functional (NFR-01…NFR-12) requirements live in [`project-ida-requirments.md`](./project-ida-requirments.md) §5. Each OpenSpec change under `openspec/changes/` maps its specs back to these IDs.

## Out of Scope (Phase 2)

Auto-publishing · dedicated vector DB (Pinecone/Weaviate) · Slack/Discord notifications · A/B testing · paid-ad analytics · white-label.

> **Scope update (2026-07-14):** auth & multi-workspace — originally listed here as Phase 2 — was pulled *into* scope and built on the backend, once it became clear the platform needs to serve several real growth teams, not one. See [Data Model](#data-model) above and `backend/src/app/modules/{User,Team,PlatformCatalog,PlatformCredential}/`. Frontend UI for it (login, admin/super_admin screens, team platform toggles) is still pending — `MEHEDI.md` tracks that.

---

## Team

**Next Wave** — Web Course Level-02

| Name | Role |
|------|------|
| Samin Israr Ravi | Developer |
| Mehedi Imun | Developer |
| Robayat Kalam Farsit | Developer |

> One-liner for judges: *"Growth Studio combines what's trending in tech with what works on YOUR channels — and generates a full week of content across Facebook, YouTube, and LinkedIn in 5 minutes, for free."*
