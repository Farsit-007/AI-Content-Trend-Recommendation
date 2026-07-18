# growth studio — Project Idea & Requirements Analysis
### Team Next Wave · AI Content & Trend Recommendation · Jul 12–18, 2026

---

## 1. The Problem (Why This Exists)

Programming Hero is a fast-growing edtech platform in Bangladesh. Their marketing team creates content for Facebook, YouTube, and LinkedIn simultaneously. They face three compounding problems:

**Problem 1 — No visibility into what's trending:**
They manually browse HackerNews, Dev.to, Twitter every day. Hours wasted. Still miss things. Competitors post trending content first.

**Problem 2 — Content creation is slow and inconsistent:**
Writing a good Bangla Facebook post takes an hour. Writing a YouTube script takes half a day. A LinkedIn post needs a different tone entirely. They can't keep up across all platforms consistently.

**Problem 3 — Content doesn't sound like them:**
Generic AI output reads nothing like a real Bangladeshi tech writer, and nothing like *their* team's own voice — readers can tell.

**The cost:**
- Trending topics missed → competitors post first
- Inconsistent posting → algorithmic penalty across all platforms
- Hours on research and writing → less time on actual marketing strategy
- Generic-sounding content → lower engagement, less trust

---

## 2. The Solution — Growth Studio

> "Growth Studio spots what's trending in tech and turns it into a full week of content across every platform in 5 minutes — in your own brand voice."

Growth Studio is a **content-intelligence platform** that does three things:

1. **Monitors** external tech trends 24/7 across HackerNews, Dev.to, GitHub, Reddit, RSS
2. **Ranks** trending topics by momentum and category fit, so the highest-opportunity ideas surface first
3. **Generates** platform-specific content in one click: Facebook post (text + Reel script), LinkedIn post, YouTube video idea (title + hook + full chapter outline + thumbnail concept), and short captions — all in **Bangla script (বাংলা)** by default (configurable per team and per request), in your brand voice, grounded in your team's own real posts

The marketing team opens one dashboard. They see what's trending and what to create next. Everything generated, in their own voice. Nothing left to guess.

---

## 3. Who Uses This (User Personas)

### Persona 1: The Content Creator / Marketing Lead (Primary User)
- Name: Mursalin Bhai, Team Lead, Next Level Engineer
- Manages: Facebook page + YouTube channel + LinkedIn simultaneously
- Daily pain: Spends 3–4 hours deciding what to create, writing scripts, adapting content per platform — often publishes inconsistently because it takes too long
- What he needs: One place that tells him what to create this week and generates the first draft for every format automatically
- Success metric: Publishes 5× per week across all platforms consistently, with content that sounds like his team actually wrote it

### Persona 2: The Marketing Executive (Secondary User)
- Name: Riya Apa, Marketing Team, Programming Hero
- Technical level: Zero. She knows Facebook and Canva.
- Daily pain: Spends 2 hours searching for "something to post about" and gives up or reposts old content
- What she needs: Open the app, see what's trending that matters to PH, click generate, copy the post, done in 5 minutes
- Success metric: Posts 5× per week consistently without researching anything manually

### Persona 3: The Content Strategist (Tertiary User)
- Name: Tanvir Bhai, Content & Growth, Programming Hero
- Daily pain: Has to brief the marketing team on what to post — takes time he doesn't have
- What he needs: A ranked queue of the week's highest-opportunity topics, with drafts already waiting for review
- Success metric: Team stops asking him "what should we post today?" — the feed and daily auto-generated drafts answer it automatically

---

## 4. Core Features (MVP Scope)

### Feature 1: Multi-Source External News Aggregation
**What it does:** Pulls tech news from multiple free sources every 3 hours, automatically.
**Sources:** HackerNews API, Dev.to API, OSS Insight (GitHub trending), Reddit (r/programming, r/webdev), RSS feeds (TechCrunch, The Verge, Smashing Magazine)
**Output:** Raw news items stored in MongoDB with source, title, URL, snippet, engagement metrics, embedding vector.

---

### Feature 2: 4-Layer AI-Cost Filter Pipeline
**What it does:** Reduces 200+ daily news items to the 20–30 that actually matter, before any LLM runs.
**Layer 1 — Keyword pre-filter:** Drop items with zero PH-relevant keywords (AI, React, Node, career, hiring, JavaScript, Python, web dev, course, learning). Pure string matching, zero cost.
**Layer 2 — Vector dedup (MongoDB Atlas Vector Search):** Generate 768-dim embedding via `nomic-ai/nomic-embed-text` on OpenRouter (free). `$vectorSearch` against existing `news_items`. Cosine similarity > 0.9 → duplicate, skip. Zero API cost beyond embedding call.
**Layer 3 — Redis cache check:** SHA256(title + URL) checked against Redis. If seen in last 24h, skip. Zero cost.
**Layer 4 — Relevance gate:** Only survivors go to LLM via OpenRouter. Items scoring < 4/10 stored but never surfaced.
**Why this matters:** AI cost stays $0 as volume scales — free OpenRouter models + Atlas Vector Search on already-free MongoDB M0 + Redis caching.

> **Built differently 2026-07-14** (`news-ingestion-pipeline`, see `SAMIN.md`): the 4 layers that shipped are (1) fetch & normalize, (2) dedupe by exact-match `content_hash` (SHA-256 of `source:url`, checked directly against MongoDB — no Redis, no 24h TTL, permanent) + a freshness window, (3) relevance scored as max cosine similarity against the **pooled embeddings of every team's `BrandVoiceExample`** (not a fixed PH-keyword list, and not per-team, since `NewsItem` stays global) with a cold-start fallback, plus a deterministic log-scaled `trend_score`, (4) batched LLM categorization + `opportunity_score`. No dedicated keyword pre-filter layer, no vector-based near-duplicate detection (two different URLs for the same story aren't caught), and no Redis involvement at all in this pipeline. This was a deliberate scope decision for the hackathon timeline, confirmed with the user rather than assumed — not a bug. If the keyword layer, Redis-backed cache, or true semantic near-dup detection matter later, that's follow-up work.
>
> **Follow-up shipped same day** (`filter-pipeline` semantic-dedup change, archived at `openspec/changes/archive/2026-07-14-filter-pipeline/`, see `SAMIN.md`): the vector-based near-duplicate gap above is now closed — a semantic dedup layer (real embeddings, cosine similarity, threshold `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD=0.88`) runs between hash-dedup and relevance scoring, reusing the same embedding already generated for relevance (no extra `embed()` calls). Live-verified against real Atlas/OpenRouter; the `0.88` threshold was itself recalibrated from an initial `0.93` guess after real embeddings of two paraphrased same-story descriptions only scored `0.8992`. The keyword pre-filter layer and Redis-backed cache are still **not** implemented. Committed and pushed to `main` direct (commit `b2bc131`).

---

### Feature 3: AI Categorization + Relevance Scoring
**What it does:** LLM via OpenRouter (batched, 10 items per call) assigns each surviving news item:
- Category: AI / Web Dev / Career / Security / DevOps / Other
- Relevance score: 1–10 (how much does this matter to PH's students and marketing?)
- Impact note: One sentence on why this matters and what PH should do about it
**Models:** `meta-llama/llama-3.1-8b-instruct:free` (primary), `mistralai/mistral-7b-instruct:free` (fallback), `google/gemma-2-9b-it:free` (secondary fallback)
**Output:** Enriched news items in MongoDB, cached in Redis 24h.

---

### Feature 4: Trend Score (Zero AI Cost)
**What it does:** Calculates a "trending potential" score from raw engagement signals — pure math, no AI.
```
trend_score = normalize(points, 500)   × 4
            + normalize(comments, 200) × 3
            + recency_decay            × 3

recency_decay = max(0, 1 − hoursOld / 48)
```
**Display:** 🔥 badge when trend_score ≥ 7. Shows architecture judgment — AI used only where it adds value.

---

> *Features 5 and 6 (Social Handle Analytics, Cross-Platform Performance Report) have been removed from scope — the product no longer pulls or reports on connected social account performance.*

### Feature 7: Impact Note
**What it does:** Per high-relevance news item, AI generates one concrete "why this matters" suggestion alongside the category/relevance scoring (Feature 3).
**Example:** "React 19 released → HIGH PRIORITY for a React-heavy audience. Suggested YouTube title: 'React 19 দিয়ে কি Job পাওয়া সহজ হবে? — Bangla Full Guide 2025'. Suggested FB hook: তুমি কি জানো React 19 তে এমন 3টা feature এসেছে...'"
**Why it wins:** Not just "what's trending globally" — a concrete, ready-to-use content angle, not just a headline.

---

### Feature 8: Multi-Format AI Content Generator
**What it does:** One trending topic → all content formats generated in one click, grounded in the team's own brand-voice examples.

**Format 1 — Facebook text post:**
Casual Bangla script (বাংলা), emoji-friendly, storytelling hook, 100–150 words. Brand voice RAG: uses vector search to find 3 most similar real posts from the team's own seeded examples, injects as few-shot examples.

**Format 2 — Facebook Reel script (60–90 sec):**
Hook line (first 3 sec), 3 key points with timestamps, CTA. Structured for vertical video. Tone matched to the team's brand-voice examples.

**Format 3 — LinkedIn post:**
Professional Bangla script, insight-driven, career angle, 150–200 words. Ends with a question to drive comments.

**Format 4 — YouTube video idea (full):**
- Title
- Hook script (first 30 seconds — most important for retention)
- Chapter outline with timestamps
- Thumbnail concept (text + visual description)
- Tags and description outline

**Format 5 — Short caption:**
Under 50 words. Works for Instagram, Twitter/X, YouTube community post.

**All formats:** Lazy generation (fires only on click), cached Redis 24h, copy to clipboard. Language configurable via `team.voice_profile.default_language` (bangla / english / banglish) or per-request `language` override — so one team can write Bangla on Facebook and English on LinkedIn.

> **Built 2026-07-15 (`rag-bangla`):** The team voice profile (`default_language`, `custom_instructions`) and per-request language override are live on `POST /content/generate` and `POST /chat`. The `seedBrandVoice.ts` script (`npm run seed:brand-voice -- <team_id> <file.json>`) embeds and upserts a batch of real posts as few-shot examples; `seed/brand-voice.example.json` provides the format with 5 Bangla-script sample posts. **Language decision 2026-07-15: default output is pure Bangla script (বাংলা), not Banglish** — LLM is instructed to keep widely-used English technical terms (AI, JavaScript, framework) in English as Bangla tech content naturally does, but never write Bengali words in Latin letters. Banglish remains selectable per-team.

---

### Feature 9: Brand Voice RAG
**What it does:** Ensures all generated content sounds like YOUR brand, in YOUR language, not generic AI output.
**How it works:**
1. Marketing team collects 25–30 real high-engagement posts from their Facebook + LinkedIn pages → seeded into `brand_voice_examples` MongoDB collection with embeddings via `npm run seed:brand-voice -- <team_id> <file.json>` (idempotent, can be re-run after adding new posts)
2. On every generation click → embed the news topic → vector search `brand_voice_examples` → fetch 3 most semantically similar real posts
3. Inject as few-shot examples into the generation prompt alongside the team's `voice_profile` (language + standing instructions)
4. LLM writes in your voice, in your language — Bangla script if that's what your examples are in
**Why vector over keyword:** "React 19 Server Components" should match a brand voice example about "web dev career growth" — same audience intent, same tone needed. Vector similarity catches this; keyword matching misses it.
**Pitch line:** "Growth Studio doesn't just write Bangla — it writes YOUR Bangla, learned from your own best-performing posts."
**Team voice profile** (`team.voice_profile`): `default_language` (bangla / english / banglish, default bangla) + `custom_instructions` (free-text standing rules — "always end with a question", "never use more than 2 emojis" — appended to every prompt with no deploy needed to change). Editable via `PATCH /teams/:teamId`.

---

### Feature 10: "Ask Growth Studio" Chat Interface
**What it does:** Marketing team asks questions in plain Bangla/English. Growth Studio answers using the team's real trending-news database as context.
**Example questions:**
- "এই সপ্তাহে AI নিয়ে কোন news আছে যেটা আমাদের YouTube এ ভালো হবে?"
- "React 19 নিয়ে কি YouTube video বানানো উচিত?"
- "এই সপ্তাহে কী নিয়ে পোস্ট করা উচিত?"
**How it works (RAG):** Query → embed → similarity search over trending `news_items` → top 5 relevant items → OpenRouter LLM → Bangla answer grounded in real trend data.
**Demo wow factor:** Judge types a live question. Gets a real, data-grounded answer in seconds. Unpredictable and always impressive.

---

### Feature 10.5: Auto-Generated Content Drafts (built 2026-07-15)
**What it does:** Growth Studio generates a full week of content per team automatically every day — no clicks required. Each morning, the system picks the top-opportunity news items for each team, generates all 5 content formats in that team's brand voice and language, and queues them as reviewable drafts.

**How it works:**
- Daily cron (`AUTO_GENERATION_CRON`, default `0 6 * * *`) runs the auto-generation job
- For each team with ≥1 brand voice example: fetch top-3 news items by `opportunity_score` → skip items already drafted for that team → call `ContentGenerationService.generateContent()` → save as `status: 'draft'`
- Teams with zero brand voice examples are skipped (cold-start guard — avoids generic content)
- `AUTO_GENERATION_MAX_PER_RUN` (default 10) caps total LLM calls per run to protect the OpenRouter free tier
- Admin can trigger an immediate run via `POST /generated-content/run`

**Draft management endpoints:**
- `GET /generated-content?team_id=&status=draft` — list drafts, filterable by status/source
- `POST /generated-content/run` — admin on-demand trigger (returns `{ teams_processed, drafts_created, skipped }`)
- `PATCH /generated-content/:id` — approve or dismiss a draft

**Demo pitch:** "Growth Studio drafts a full week of Bangla content for your team while you sleep — you wake up to 3 ready-to-post drafts. One click to approve."

---

### Feature 11: News Feed Dashboard UI
**Style:** daily.dev — card-based, dark theme, tab filtering.
**Tabs:** Headlines / AI / Web Dev / Career / Security
**Each card shows:** Title, source, time ago, category badge, trend score 🔥, relevance score, impact note, "Generate Content" button.
**Sorting:** Latest / Most Relevant / Trending
**Opportunity badge:** Cards whose computed `opportunity_score` clears a threshold (currently 7.5/10) get a "High opportunity" tag.

---

## 5. Requirements Analysis

### Functional Requirements

| ID | Requirement | Priority | Feature |
|---|---|---|---|
| FR-01 | System fetches news from ≥3 sources every 3 hours | Must Have | News Aggregation |
| FR-02 | Duplicate news items filtered via vector similarity **(built 2026-07-14 as exact-match `content_hash` dedup first; cross-source vector/semantic similarity dedup added same day as a follow-up layer, threshold 0.88 — see `filter-pipeline` in `SAMIN.md`; committed to `main`)** | Must Have | Filter Pipeline |
| FR-03 | Each news item has category, relevance score, trend score, impact note | Must Have | AI Scoring |
| FR-04 | Items with relevance < 4 not surfaced to users **(built 2026-07-14 — `NEWS_INGESTION_MIN_RELEVANCE`, default 4.0; skipped when no `BrandVoiceExample` docs exist yet, cold start)** | Must Have | Filter Pipeline |
| FR-05 | User can filter feed by category and sort by latest/relevance/trend | Must Have | Dashboard |
| ~~FR-06~~ | *Retired — Social Handle Analytics removed from scope* (was: pull last-30-day analytics per team-enabled platform) | — | — |
| ~~FR-07~~ | *Retired 2026-07-14 — merged into FR-06, then FR-06 itself retired* (was: YouTube analytics as its own requirement) | — | — |
| ~~FR-08~~ | *Retired 2026-07-14 — merged into FR-06, then FR-06 itself retired* (was: LinkedIn analytics as its own requirement) | — | — |
| ~~FR-09~~ | *Retired — Cross-Platform Report removed from scope* (was: 30-day cross-platform performance report on demand) | — | — |
| ~~FR-10~~ | *Retired — Cross-Platform Report removed from scope* (was: report top posts/best times/engagement trends per platform) | — | — |
| ~~FR-11~~ | *Retired — Cross-Platform Report removed from scope* (was: report AI-generated cross-platform insight) | — | — |
| ~~FR-12~~ | *Retired — Cross-Platform Report removed from scope* (was: content opportunity ranking via trend × audience data) | — | — |
| FR-13 | User can generate Facebook text post from any news card | Must Have | Content Generator |
| FR-14 | User can generate Facebook Reel script (60–90 sec) from any news card | Must Have | Content Generator |
| FR-15 | User can generate LinkedIn post from any news card | Must Have | Content Generator |
| FR-16 | User can generate full YouTube video idea (title + hook + chapters + thumbnail) | Must Have | Content Generator |
| FR-17 | User can generate short caption from any news card | Should Have | Content Generator |
| FR-18 | All generated content uses Brand Voice RAG (vector search on real posts) | Must Have | Brand Voice RAG |
| ~~FR-19~~ | *Retired — Social Handle Analytics removed from scope* (was: personalize generation using pulled platform analytics; brand-voice-example grounding via FR-18 covers personalization instead) | — | — |
| FR-20 | Generated content cached in Redis — regenerating is instant | Should Have | Content Generator |
| FR-21 | User can copy any generated content to clipboard | Must Have | Content Generator |
| FR-22 | User can ask natural language questions about trending news in **Bangla or English** **(built 2026-07-14 — `POST /chat`, retrieval over the team's trending news, multi-turn via `conversation_id`; language decision updated 2026-07-15 — was "Banglish", now Bangla script by default, per-request override supported)** | Should Have | Chat |
| FR-23 | Chat answers grounded in real news data via RAG **(built 2026-07-14 — same change as FR-22; verification partially blocked by an exhausted OpenRouter quota, retrieval pipeline confirmed reaching the LLM call correctly)** | Should Have | Chat |
| FR-24 | News cards show "High opportunity" badge when the computed `opportunity_score` clears a threshold | Should Have | Dashboard |
| FR-25 | Admin can manually trigger news ingestion run **(built 2026-07-14 — `POST /news-items/ingest`, admin-only)** | Should Have | Demo tool |
| FR-27 | System auto-generates content drafts daily per team (top-opportunity news × brand voice, daily cron 06:00) **(built 2026-07-15 — `generatedContent.job.ts`, `startAutoGenerationScheduler()`; teams without brand voice examples skipped; `AUTO_GENERATION_MAX_PER_RUN` quota cap)** | Should Have | Auto-Generation |
| FR-28 | Admin can manually trigger auto-generation run for all or one team **(built 2026-07-15 — `POST /generated-content/run`, returns `{ teams_processed, drafts_created, skipped }`)** | Should Have | Demo tool |
| FR-29 | Team member can approve or dismiss auto-generated drafts **(built 2026-07-15 — `PATCH /generated-content/:id`, `GET /generated-content?team_id=&status=`)** | Should Have | Auto-Generation |
| FR-30 | Generated content language defaults to Bangla script per team; overridable per request **(built 2026-07-15 — `team.voice_profile.default_language`, per-request `language` param on `/content/generate` and `/chat`)** | Must Have | Content Generator |

### Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | News feed load time | < 1.5 seconds (cached) |
| NFR-02 | Content generation time (all formats) | < 10 seconds |
| NFR-03 | Chat response time | < 6 seconds |
| NFR-06 | News ingestion pipeline | Every 3 hours, unattended |
| NFR-07 | Mobile responsive | Yes — marketing team uses phones |
| NFR-08 | AI model cost | $0 — all LLMs + embeddings via OpenRouter free tier |
| NFR-10 | Vector search latency | < 200ms — MongoDB Atlas Vector Search M0 |
| NFR-11 | Embedding generation time | < 500ms — nomic-embed-text via OpenRouter |
| NFR-12 | Works on demo day (cold start handled) | Yes — warm app 5 min before presenting |

---

## 5.5 AI Stack — OpenRouter Free Tier (Zero Cost)

All LLM and embedding calls via OpenRouter free tier. Zero paid APIs.

| Task | Model | Why |
|---|---|---|
| Batch news categorization | `meta-llama/llama-3.1-8b-instruct:free` | Fast, structured JSON output |
| Content generation (all formats) | `mistralai/mistral-7b-instruct:free` | Strong creative writing, good Banglish |
| Chat / Ask Growth Studio | `meta-llama/llama-3.1-8b-instruct:free` | Fast, good context handling |
| Embeddings (all flows) | `nomic-ai/nomic-embed-text` | 768-dim, free, same client |
| Fallback | `google/gemma-2-9b-it:free` | Always-available backup |

**Rate limit mitigation:** Redis caching means most requests never hit OpenRouter. Batching reduces call volume 10×.

---

## 5.7 Vector DB Architecture — MongoDB Atlas Vector Search

All vector operations inside MongoDB Atlas M0 (free). No new infrastructure.

### Two vector indexes

**Index 1 — `news_items.embedding`** (1536-dim, cosine)
→ Used for: semantic dedup at ingestion + Ask Growth Studio RAG chat

**Index 2 — `brand_voice_examples.embedding`** (1536-dim, cosine)
→ Used for: Brand Voice RAG at content generation time

### Three RAG flows

**Flow 1 — Semantic dedup (ingestion):**
```
New item → embed → $vectorSearch news_items limit:1
→ score > 0.88 → duplicate, skip
→ score ≤ 0.88 → new, continue pipeline
```

**Flow 2 — Ask Growth Studio chat:**
```
User query → embed → similarity search news_items limit:5
→ top 5 items as context → OpenRouter LLM → Bangla answer
```

**Flow 3 — Brand Voice RAG (content generation):**
```
Topic → embed → similarity search brand_voice_examples limit:3
→ 3 real posts as few-shot examples → inject into generation prompt
→ OpenRouter LLM → one call per requested format → Redis cache per format
```

---

## 5.8 Data Models

### `news_items`
```js
{
  _id, source, source_id, content_hash,
  title, url, snippet, published_at,
  engagement: { points, comments, stars_delta },
  trend_score,                    // math formula, no AI
  category, relevance_score, impact_note,  // AI-generated
  embedding: [Number],            // 1536-dim, openai/text-embedding-3-small via OpenRouter
  opportunity_score,              // deterministic: W_RELEVANCE×relevance + W_TREND×trend + W_FIT×audience_fit
  processed, created_at
}
```

### `generated_content`
```js
{
  _id,
  team_id,                          // owning team — team-scoped, see §5.9
  news_item_id,                     // optional; compound unique index with team_id (sparse)
  topic: String,
  formats: {
    facebook_post: String,
    facebook_reel_script: String,
    linkedin_post: String,
    youtube_idea: { title, hook, chapters: [String], thumbnail_concept },
    caption: String
  },
  source: 'auto' | 'manual',        // 'auto' = daily job; 'manual' = user-triggered
  status: 'draft' | 'approved' | 'dismissed',
  model_used: String,
  created_at: Date
}
// Indexes: (team_id, news_item_id) unique sparse — prevents duplicate drafts per team+item
//          (team_id, created_at desc) — list query
```
> **Updated 2026-07-15 (`rag-bangla`):** Schema extended vs. original plan — added `team_id`, `topic`, `source`, `status`, `model_used`; removed `opportunity_score` (already on the `NewsItem`). The compound unique index on `(team_id, news_item_id)` prevents the daily auto-generation job from creating duplicate drafts for the same team+news-item pair.

### `brand_voice_examples`
```js
{
  _id, team_id,                   // owning team — see §5.9
  platform, category,
  content: String,
  embedding: [Number],            // 768-dim
  engagement_hint: String,
  added_by, created_at
}
```

---

## 5.9 Multi-Team & Access Control (built 2026-07-14 — backend)

The MVP scope originally assumed one company, one shared account. In practice, the company runs **several independent growth teams**, each with its own brand voice and category subscriptions, and one team must never see another's data. This section documents what was actually built to satisfy that.

**Roles** (`users.role`):
- `user` — sees only the team(s) they belong to.
- `admin` — can create teams and users, manage team membership; sees every team's data.
- `super_admin` — everything an `admin` can do, plus platform-level administrative capabilities beyond any single team's scope (e.g. curating the shared style-pack library, §6-VISION-BANGLA-STYLE-PACKS-OPENSPEC-PLAN.md). Only a `super_admin` can create/promote another `super_admin`. The first one is auto-seeded on server start from `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` if it doesn't already exist.

**Teams:** many-to-many with users (a user can belong to more than one team). Admins create teams and assign members; `BrandVoiceExample` carries `team_id` and is scoped accordingly — a team's own brand-voice examples are invisible to other teams (admins/super_admins see everything). `news_items` stays global — it's external trend data, not team-authored.

**Key endpoints:** `POST /auth/login`, `GET /auth/me`, `POST /users` (admin), `POST /teams` (admin) + membership management, `PATCH /teams/:teamId` (voice profile, category subscriptions, default style pack). Full contract at `/api/v1/docs`.

---

## 6. What Is Out of Scope (Phase 2 talking points)

> **Scope update (2026-07-14):** the line below — "user authentication and multi-workspace" — described the *original* MVP assumption of one team (Programming Hero) sharing everything. That assumption turned out to be wrong: the company actually runs several independent growth teams, each with its own members, brand voice, and category subscriptions, that must never see each other's data. Auth + multi-team was pulled into scope and built on the backend as a result — see new §5.9 below; frontend for it (login, team settings) has since shipped too.

- ~~User authentication and multi-workspace~~ — built, see §5.9
- ~~Auto-generated daily content drafts per team~~ — built 2026-07-15, see Feature 10.5 and FR-27–29
- ~~Bangla script output (was listed as Banglish)~~ — language decision updated 2026-07-15; pure Bangla script is now the default with per-team and per-request language override
- Auto-publishing directly to platforms (API approval + scheduling complexity)
- Dedicated vector database (Pinecone, Weaviate) — Atlas covers all needs free
- Slack/Discord notifications
- A/B testing content variants
- Paid ad performance analytics
- White-label version for agencies

---

## 7. Success Criteria for Judges

1. **Problem-solution fit**
   → Real problem from inside PH. Three platforms, one dashboard, one source of truth for what to create next. No team is solving this completely.

2. **Technical depth**
   → 4-layer filter pipeline, 3 RAG flows, 2 vector indexes on MongoDB Atlas, deterministic opportunity scoring (relevance × trend × audience-fit), Brand Voice RAG, OpenRouter free tier with fallback chain, lazy generation, Redis caching. Every decision defensible.

3. **Demo impact**
   → Open dashboard: live news feed. Click "Generate": 5 formats appear in 10 seconds in Bangla, in the team's own voice. Ask a question in chat: data-grounded answer in 6 seconds. Judges see a working product, not a mockup.

4. **Real-world scalability**
   → $0 AI cost. $0 API cost. Content generation cached so 100 users cost same as 1. Architecture documented. Monorepo + OpenAPI spec = team worked like professionals.

5. **Presentation clarity**
   → One sentence: "Growth Studio spots what's trending in tech and turns it into a full week of content for Facebook, YouTube, and LinkedIn in 5 minutes — in your own brand voice, for free."