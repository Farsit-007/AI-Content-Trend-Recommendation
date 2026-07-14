# growth studio — Project Idea & Requirements Analysis
### Team Next Wave · AI Content & Trend Recommendation · Jul 12–18, 2026

---

## 1. The Problem (Why This Exists)

Programming Hero is a fast-growing edtech platform in Bangladesh. Their marketing team manages content across Facebook, YouTube, and LinkedIn simultaneously. They face four compounding problems:

**Problem 1 — No visibility into what's trending:**
They manually browse HackerNews, Dev.to, Twitter every day. Hours wasted. Still miss things. Competitors post trending content first.

**Problem 2 — No understanding of their own audience:**
They don't know which of their posts actually performed well, which topics their audience responds to, or what time to post. No single dashboard shows Facebook + YouTube + LinkedIn together.

**Problem 3 — Content creation is slow and inconsistent:**
Writing a good Banglish Facebook post takes an hour. Writing a YouTube script takes half a day. A LinkedIn post needs a different tone entirely. They can't keep up across all platforms consistently.

**Problem 4 — No connection between trends and their own data:**
Even if they find a trending topic, they don't know if *their audience* cares about it. A generic trending topic and a topic that their specific followers engage with are completely different things.

**The cost:**
- Trending topics missed → competitors post first
- Wrong content posted → low engagement, wasted effort
- Inconsistent posting → algorithmic penalty across all platforms
- Hours on research and writing → less time on actual marketing strategy
- No cross-platform view → blind decisions on what to create next

---

## 2. The Solution — Growth Studio

> "Growth Studio is the only tool that combines what's trending in tech with what works on YOUR channels — and turns it into a full week of content across every platform in 5 minutes."

Growth Studio is a **full marketing intelligence platform** that does four things:

1. **Monitors** external tech trends 24/7 across HackerNews, Dev.to, GitHub, Reddit, RSS
2. **Analyzes** your own Facebook page, YouTube channel, and LinkedIn performance over the last 30 days — reach, views, engagement, best times, top content
3. **Cross-references** trending topics with your own audience data to surface the highest-opportunity content ideas ranked by what will work for YOUR specific followers
4. **Generates** platform-specific content in one click: Facebook post (text + Reel script), LinkedIn post, YouTube video idea (title + hook + full chapter outline + thumbnail concept), and short captions — all in Banglish, in your brand voice, personalized to your page's own performance history

The marketing team opens one dashboard. They see what's trending, what's working on their channels, and what to create next. Everything generated. Nothing left to guess.

---

## 3. Who Uses This (User Personas)

### Persona 1: The Content Creator / Marketing Lead (Primary User)
- Name: Mursalin Bhai, Team Lead, Next Level Engineer
- Manages: Facebook page + YouTube channel + LinkedIn simultaneously
- Daily pain: Spends 3–4 hours deciding what to create, writing scripts, adapting content per platform — often publishes inconsistently because it takes too long
- What he needs: One place that tells him what to create this week and generates the first draft for every format automatically
- Success metric: Publishes 5× per week across all platforms consistently, with content that matches what his audience actually engages with

### Persona 2: The Marketing Executive (Secondary User)
- Name: Riya Apa, Marketing Team, Programming Hero
- Technical level: Zero. She knows Facebook and Canva.
- Daily pain: Spends 2 hours searching for "something to post about" and gives up or reposts old content
- What she needs: Open the app, see what's trending that matters to PH, click generate, copy the post, done in 5 minutes
- Success metric: Posts 5× per week consistently without researching anything manually

### Persona 3: The Content Strategist (Tertiary User)
- Name: Tanvir Bhai, Content & Growth, Programming Hero
- Daily pain: Has to brief the marketing team on what to post — takes time he doesn't have
- What he needs: A weekly AI-generated strategy report showing what performed last month and what to prioritize next week
- Success metric: Team stops asking him "what should we post today?" — the report answers it automatically

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
> **Follow-up shipped same day** (`filter-pipeline` semantic-dedup change, archived at `openspec/changes/archive/2026-07-14-filter-pipeline/`, see `SAMIN.md`): the vector-based near-duplicate gap above is now closed — a semantic dedup layer (real embeddings, cosine similarity, threshold `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD=0.88`) runs between hash-dedup and relevance scoring, reusing the same embedding already generated for relevance (no extra `embed()` calls). Live-verified against real Atlas/OpenRouter; the `0.88` threshold was itself recalibrated from an initial `0.93` guess after real embeddings of two paraphrased same-story descriptions only scored `0.8992`. The keyword pre-filter layer and Redis-backed cache are still **not** implemented. **Not yet committed** — sitting as working-tree changes on `main`.

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

### Feature 5: Social Handle Analytics (dynamic, per-team platform)
> **Updated 2026-07-14 — merges what used to be three separate features** ("Facebook Page Analytics", "YouTube Channel Analytics", "LinkedIn Page Analytics"). Those assumed one Facebook page / YouTube channel / LinkedIn profile shared by the whole company. That's no longer the model: the company runs several growth **teams**, each connecting its own accounts, and the set of platforms isn't fixed to these three — a `super_admin` curates a platform catalog and each team enables only what it uses (§5.9). One generic analytics job now pulls data for **whichever platforms a team has enabled**, dispatching to a per-platform adapter. `getPlatformToken(platform, teamId)` resolves a team's own encrypted credential first, falling back to a single `.env` bootstrap token per built-in platform (still supported, so analytics work unblocked even with zero teams configured).

**What it does:** For every team, for every platform that team has enabled, pulls the last 30 days of that platform's performance data via its adapter.

**Built-in adapters today** (more can be added as a team enables a new catalog platform — no architecture change required, just a new adapter function):

| Adapter | API | Data collected | Permissions / setup |
|---|---|---|---|
| **Facebook** | Meta Graph API (free w/ page admin access) | Post reach & impressions, engagement breakdown (likes/comments/shares/reactions), top 10 posts by engagement rate, best posting times, follower growth, video vs text vs Reel comparison, top categories | `pages_read_engagement`, `pages_show_list`, `read_insights` |
| **YouTube** | YouTube Data API v3 (free, 10,000 units/day) | Total views & watch time, avg. view duration/retention, CTR by video, top 10 videos by views/watch time, topic analysis, subscriber growth, best-performing formats | API key (Google Cloud Console, free tier) |
| **LinkedIn** | LinkedIn API | Post impressions & engagement rate, follower demographics, top posts, profile/page visits | `r_organization_social`, `r_basicprofile` — approval is strictest of the three, start this setup immediately |

**Stored in:** `platform_analytics` (per team, per platform — see §5.8), refreshed every 6 hours. **Fallback:** a platform pending approval (e.g. LinkedIn) simply doesn't run its adapter yet for teams that enabled it — surfaced as "connected but pending approval" (§5.6), and doesn't block the other platforms' adapters or the analytics job as a whole.

---

### Feature 6: Cross-Platform 30-Day Performance Report
**What it does:** Combines data from every platform a team has enabled into one unified AI-generated report. Runs on demand or auto-generates weekly.
**Report sections:**
1. **Overview metrics** — Total reach, total engagements, total video views, average engagement rate across all of the team's enabled platforms, with delta vs previous 30 days
2. **Per-platform performance** — one section per platform the team has enabled (Facebook: top posts, best times, content type breakdown, engagement rate trends · YouTube: top videos by views/watch time, CTR, retention, topic breakdown · LinkedIn: impressions, engagement rate vs industry average, top posts, demographics · any further platform: whatever its adapter collects, §5)
3. **AI cross-platform insight** — What content themes worked across the team's enabled platforms? Where is the biggest gap between your output and your audience's interest?
4. **Content opportunity ranking** — This week's top 5 content ideas ranked by: (trend score × your historical engagement on that topic). Shows which format per idea, matched to whichever of the team's platforms it targets.
**Generated by:** OpenRouter LLM with all of the team's platform data as structured context. Output is a readable Banglish report, not raw numbers.
**Cached:** Redis 6h (expensive to regenerate, rarely changes intraday).

---

### Feature 7: Impact Simulator
**What it does:** Per high-relevance news item, AI generates one concrete business suggestion.
**Example:** "React 19 released → your React content historically gets 3× your average engagement → HIGH PRIORITY. Suggested YouTube title: 'React 19 দিয়ে কি Job পাওয়া সহজ হবে? — Bangla Full Guide 2025'. Suggested FB hook: তুমি কি জানো React 19 তে এমন 3টা feature এসেছে...'"
**Why it wins:** Not just "what's trending globally" — it's "what's trending + what works for YOUR audience specifically."

---

### Feature 8: Multi-Format AI Content Generator
**What it does:** One trending topic → all content formats generated in one click, personalized to each platform's performance patterns.

**Format 1 — Facebook text post:**
Casual Banglish, emoji-friendly, storytelling hook, 100–150 words. Brand voice RAG: uses vector search to find 3 most similar high-engagement real posts from your page, injects as few-shot examples.

**Format 2 — Facebook Reel script (60–90 sec):**
Hook line (first 3 sec), 3 key points with timestamps, CTA. Structured for vertical video. Tone matched to your best-performing Reels.

**Format 3 — LinkedIn post:**
Professional Banglish, insight-driven, career angle, 150–200 words. Ends with a question to drive comments. Based on your LinkedIn engagement patterns.

**Format 4 — YouTube video idea (full):**
- Title (optimized for your channel's CTR patterns)
- Hook script (first 30 seconds — most important for retention)
- Chapter outline with timestamps (based on your average video length that holds retention)
- Thumbnail concept (text + visual description, based on your highest-CTR thumbnails)
- Tags and description outline

**Format 5 — Short caption:**
Under 50 words. Works for Instagram, Twitter/X, YouTube community post.

**All formats:** Lazy generation (fires only on click), cached Redis 24h, copy to clipboard.

---

### Feature 9: Brand Voice RAG
**What it does:** Ensures all generated content sounds like YOUR brand, not generic AI Banglish.
**How it works:**
1. Marketing team collects 25–30 real high-engagement posts from their Facebook + LinkedIn pages → seeded into `brand_voice_examples` MongoDB collection with embeddings
2. On every generation click → embed the news topic → `$vectorSearch` `brand_voice_examples` → fetch 3 most semantically similar real posts
3. Inject as few-shot examples into the generation prompt
4. LLM writes in your voice, not a generic voice
**Why vector over keyword:** "React 19 Server Components" should match a brand voice example about "web dev career growth" — same audience intent, same tone needed. Vector similarity catches this; keyword matching misses it.
**Pitch line:** "Growth Studio doesn't just write Banglish — it writes YOUR Banglish, learned from your own best-performing posts."

---

### Feature 10: "Ask Growth Studio" Chat Interface
**What it does:** Marketing team asks questions in plain Banglish/English. Growth Studio answers using your real news database + your platform analytics as context.
**Example questions:**
- "এই সপ্তাহে AI নিয়ে কোন news আছে যেটা আমাদের YouTube এ ভালো হবে?"
- "আমাদের Facebook এ কোন ধরনের post সবচেয়ে বেশি engagement পায়?"
- "React 19 নিয়ে কি YouTube video বানানো উচিত?"
**How it works (RAG):** Query → embed → `$vectorSearch` news_items + platform_analytics context → top 5 relevant items → OpenRouter LLM → Banglish answer grounded in real data.
**Demo wow factor:** Judge types a live question. Gets a real, data-grounded answer in seconds. Unpredictable and always impressive.

---

### Feature 11: News Feed Dashboard UI
**Style:** daily.dev — card-based, dark theme, tab filtering.
**Tabs:** Headlines / AI / Web Dev / Career / Security
**Each card shows:** Title, source, time ago, category badge, trend score 🔥, relevance score, impact note, "Generate Content" button.
**Sorting:** Latest / Most Relevant / Trending
**Opportunity badge:** Cards matching your high-engagement topics get a "High opportunity for your audience" tag based on platform analytics cross-reference.

---

## 5. Requirements Analysis

### Functional Requirements

| ID | Requirement | Priority | Feature |
|---|---|---|---|
| FR-01 | System fetches news from ≥3 sources every 3 hours | Must Have | News Aggregation |
| FR-02 | Duplicate news items filtered via vector similarity **(built 2026-07-14 as exact-match `content_hash` dedup first; cross-source vector/semantic similarity dedup added same day as a follow-up layer, threshold 0.88 — see `filter-pipeline` in `SAMIN.md`; not yet committed)** | Must Have | Filter Pipeline |
| FR-03 | Each news item has category, relevance score, trend score, impact note | Must Have | AI Scoring |
| FR-04 | Items with relevance < 4 not surfaced to users **(built 2026-07-14 — `NEWS_INGESTION_MIN_RELEVANCE`, default 4.0; skipped when no `BrandVoiceExample` docs exist yet, cold start)** | Must Have | Filter Pipeline |
| FR-05 | User can filter feed by category and sort by latest/relevance/trend | Must Have | Dashboard |
| FR-06 | System pulls last-30-day analytics for every platform a team has enabled, via a per-platform adapter (Facebook/Meta Graph API and YouTube/Data API v3 built in as Must Have; LinkedIn and any further catalog platform as Should Have — degrades to "pending approval" per platform, never blocks the others) | Must Have | Social Handle Analytics |
| ~~FR-07~~ | *Retired 2026-07-14 — merged into FR-06* (was: YouTube analytics as its own requirement) | — | — |
| ~~FR-08~~ | *Retired 2026-07-14 — merged into FR-06* (was: LinkedIn analytics as its own requirement) | — | — |
| FR-09 | 30-day cross-platform performance report generated on demand | Must Have | Report |
| FR-10 | Report includes top posts, best times, engagement trends per platform | Must Have | Report |
| FR-11 | Report includes AI-generated cross-platform insight in Banglish | Must Have | Report |
| FR-12 | Content opportunity ranking: trends × your audience data | Must Have | Report |
| FR-13 | User can generate Facebook text post from any news card | Must Have | Content Generator |
| FR-14 | User can generate Facebook Reel script (60–90 sec) from any news card | Must Have | Content Generator |
| FR-15 | User can generate LinkedIn post from any news card | Must Have | Content Generator |
| FR-16 | User can generate full YouTube video idea (title + hook + chapters + thumbnail) | Must Have | Content Generator |
| FR-17 | User can generate short caption from any news card | Should Have | Content Generator |
| FR-18 | All generated content uses Brand Voice RAG (vector search on real posts) | Must Have | Brand Voice RAG |
| FR-19 | Generated content personalized using platform analytics (what works for YOUR audience) | Must Have | Content Generator |
| FR-20 | Generated content cached in Redis 24h — regenerating is instant | Should Have | Content Generator |
| FR-21 | User can copy any generated content to clipboard | Must Have | Content Generator |
| FR-22 | User can ask natural language questions about news + their analytics | Should Have | Chat |
| FR-23 | Chat answers grounded in real news + real platform data via RAG | Should Have | Chat |
| FR-24 | News cards show "High opportunity" badge when topic matches user's top engagement patterns | Should Have | Dashboard |
| FR-25 | Admin can manually trigger news ingestion run **(built 2026-07-14 — `POST /news-items/ingest`, admin-only)** | Should Have | Demo tool |
| FR-26 | Admin can manually trigger platform analytics refresh | Should Have | Demo tool |

### Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | News feed load time | < 1.5 seconds (cached) |
| NFR-02 | Content generation time (all formats) | < 10 seconds |
| NFR-03 | Chat response time | < 6 seconds |
| NFR-04 | Report generation time | < 15 seconds |
| NFR-05 | Platform analytics refresh | Every 6 hours |
| NFR-06 | News ingestion pipeline | Every 3 hours, unattended |
| NFR-07 | Mobile responsive | Yes — marketing team uses phones |
| NFR-08 | AI model cost | $0 — all LLMs + embeddings via OpenRouter free tier |
| NFR-09 | Platform API cost | $0 — Meta Graph API, YouTube Data API v3, LinkedIn API all free |
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
| Report generation | `meta-llama/llama-3.1-8b-instruct:free` | Long context, analytical |
| Chat / Ask Growth Studio | `meta-llama/llama-3.1-8b-instruct:free` | Fast, good context handling |
| Embeddings (all flows) | `nomic-ai/nomic-embed-text` | 768-dim, free, same client |
| Fallback | `google/gemma-2-9b-it:free` | Always-available backup |

**Rate limit mitigation:** Redis caching means most requests never hit OpenRouter. Batching reduces call volume 10×. Platform analytics refreshed every 6h not per-request.

---

## 5.6 Platform Data Sources — API Setup

> These 3 are the platforms with a built-in adapter and an `.env` bootstrap-token fallback today (§5, §5.9). Any team can also enable and add credentials for other platforms via the Platform Catalog — those just don't have an analytics adapter written yet.

### Facebook (Meta Graph API)
- **Setup owner:** Mursalin (page admin of Next Level Engineer)
- **Steps:** Create Facebook Developer App → add Next Level Engineer page → generate long-lived Page Access Token → store in `.env`
- **Permissions needed:** `pages_read_engagement`, `pages_show_list`, `read_insights`
- **Cost:** Free
- **Data endpoints:** `/page/insights`, `/page/posts?fields=insights`, `page_fans`, `page_impressions_by_hour`

### YouTube (YouTube Data API v3)
- **Setup owner:** Mursalin (channel owner)
- **Steps:** Google Cloud Console → enable YouTube Data API v3 → create API key → store in `.env`
- **Cost:** Free (10,000 units/day — well within limits)
- **Data endpoints:** `channels`, `videos`, `analytics/v1/reports`

### LinkedIn (LinkedIn API)
- **Setup owner:** Mursalin (company page admin or personal profile)
- **Steps:** LinkedIn Developer App → request `r_organization_social` + `r_basicprofile` → OAuth 2.0 flow
- **Cost:** Free
- **Warning:** LinkedIn API approval is slowest — submit today, may take 2–3 days
- **Fallback if delayed:** Show Facebook + YouTube data only in demo, mention LinkedIn as "connected but pending approval"

---

## 5.7 Vector DB Architecture — MongoDB Atlas Vector Search

All vector operations inside MongoDB Atlas M0 (free). No new infrastructure.

### Three vector indexes

**Index 1 — `news_items.embedding`** (768-dim, cosine)
→ Used for: semantic dedup at ingestion + Ask Growth Studio RAG chat

**Index 2 — `brand_voice_examples.embedding`** (768-dim, cosine)
→ Used for: Brand Voice RAG at content generation time

**Index 3 — `platform_analytics.posts.embedding`** (768-dim, cosine)
→ Used for: opportunity scoring (find which stored posts are semantically similar to a trending news item, pull their engagement data, compute opportunity score)

### Four RAG flows

**Flow 1 — Semantic dedup (ingestion):**
```
New item → embed (nomic) → $vectorSearch news_items limit:1
→ score > 0.9 → duplicate, skip
→ score ≤ 0.9 → new, continue pipeline
```

**Flow 2 — Ask Growth Studio chat:**
```
User query → embed → $vectorSearch news_items limit:5
→ top 5 items as context → OpenRouter LLM → Banglish answer → Redis 10min
```

**Flow 3 — Brand Voice RAG (content generation):**
```
News title → embed → $vectorSearch brand_voice_examples limit:3
→ 3 real posts as few-shot examples → inject into generation prompt
→ OpenRouter LLM → all 5 content formats → Redis 24h
```

**Flow 4 — Opportunity scoring (cross-reference):**
```
Trending news item → embed → $vectorSearch platform_analytics.posts limit:10
→ fetch engagement metrics of similar past posts
→ compute opportunity_score = trend_score × avg_engagement_of_similar_posts
→ rank content ideas by opportunity_score, not just global trend
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
  embedding: [Number],            // 768-dim, nomic-embed-text
  opportunity_score,              // trend_score × audience match
  processed, created_at
}
```

### `platform_analytics`
```js
{
  _id, team_id,                   // owning team — see §5.9
  platform: String,               // any platform the team has enabled via the Platform Catalog;
                                   // facebook/youtube/linkedin have built-in adapters today
  period: { start: Date, end: Date },
  overview: { reach, engagements, views, engagement_rate },
  top_posts: [{ id, title, reach, engagement, format, published_at }],
  best_times: [{ hour, day, avg_reach }],
  content_breakdown: [{ format, avg_engagement_rate }],
  fetched_at: Date
}
```

### `platform_posts` (individual posts with embeddings for opportunity scoring)
```js
{
  _id, team_id,                   // owning team — see §5.9. Unique per (team_id, platform, post_id)
  platform, post_id, content_snippet,
  embedding: [Number],            // for opportunity scoring flow
  metrics: { reach, likes, comments, shares, views },
  published_at, fetched_at
}
```

### `generated_content`
```js
{
  _id, news_id, formats: {
    facebook_post: String,
    facebook_reel_script: String,
    linkedin_post: String,
    youtube_idea: { title, hook, chapters, thumbnail_concept },
    caption: String
  },
  opportunity_score, created_at
}
```

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

### `reports`
```js
{
  _id, team_id,                   // owning team — see §5.9
  period: { start, end },
  overview: { total_reach, total_engagements, total_views, avg_engagement_rate },
  platform_summaries: { [platform: String]: {} },   // one entry per platform the team has enabled —
                                                      // not a fixed facebook/youtube/linkedin shape
  ai_insight: String,             // Banglish narrative
  content_opportunities: [{ rank, topic, formats, opportunity_score, reason }],
  generated_at: Date
}
```

---

## 5.9 Multi-Team & Access Control (built 2026-07-14 — backend)

The MVP scope originally assumed one company, one set of social accounts. In practice, the company runs **several independent growth teams**, each managing its own social channels, and one team must never see another's data. This section documents what was actually built to satisfy that.

**Roles** (`users.role`):
- `user` — sees only the team(s) they belong to.
- `admin` — can create teams and users, manage team membership; sees every team's data.
- `super_admin` — everything an `admin` can do, plus owns the **platform catalog** (below). Only a `super_admin` can create/promote another `super_admin`. The first one is auto-seeded on server start from `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` if it doesn't already exist.

**Teams:** many-to-many with users (a user can belong to more than one team). Admins create teams and assign members; `PlatformPost` and `BrandVoiceExample` now carry `team_id` and are scoped accordingly — a team's own posts/brand-voice examples are invisible to other teams (admins/super_admins see everything). `news_items` stays global — it's external trend data, not team-authored.

**Dynamic platform catalog:** rather than hardcoding Facebook/YouTube/LinkedIn as the only platforms a team can use, a `super_admin` curates a catalog of platforms that exist in the system at all (create "facebook", "reddit", etc., each with a global on/off switch). Each **team** then independently enables only the platforms it actually uses. A team can't submit a credential for a platform it hasn't enabled; disabling a platform globally immediately blocks every team from using it (re-enabling instantly restores it, no per-team action needed).

**Encrypted per-team credentials:** each team submits its own platform token/API key, encrypted at rest (AES-256-GCM, same scheme as before) — not the single shared `.env` token the original plan assumed. Listing credentials only ever shows a masked `token_last4`; a separate explicit "reveal" action decrypts and returns the real token. The `.env` bootstrap token is kept as a fallback for Facebook/YouTube/LinkedIn specifically, so analytics work unblocked before any team configures its own.

**Key endpoints:** `POST /auth/login`, `GET /auth/me`, `POST /users` (admin), `POST /teams` (admin) + membership management, `POST /platforms` (super_admin catalog CRUD), `POST /teams/:teamId/platforms/:platform/enable|disable`, `POST /teams/:teamId/credentials` + masked list + `/reveal`. Full contract at `/api/v1/docs`.

---

## 6. What Is Out of Scope (Phase 2 talking points)

> **Scope update (2026-07-14):** the line below — "user authentication and multi-workspace" — described the *original* MVP assumption of one team (Programming Hero) with one Facebook/YouTube/LinkedIn account each. That assumption turned out to be wrong: the company actually runs several independent growth teams, each with its own members and its own social accounts, that must never see each other's data. Auth + multi-team was pulled into scope and built on the backend as a result — see new §5.9 below. What's still Phase 2 is the *frontend* for it (login screen, admin/super_admin dashboards, per-team platform toggles).

- ~~User authentication and multi-workspace~~ — built, see §5.9
- Auto-publishing directly to platforms (API approval + scheduling complexity)
- Dedicated vector database (Pinecone, Weaviate) — Atlas covers all needs free
- Slack/Discord notifications
- A/B testing content variants
- Paid ad performance analytics
- White-label version for agencies

---

## 7. Success Criteria for Judges

1. **Problem-solution fit**
   → Real problem from inside PH. Three platforms, one dashboard, one source of truth. No team is solving this completely.

2. **Technical depth**
   → 4-layer filter pipeline, 4 RAG flows, 3 vector indexes on MongoDB Atlas, cross-platform opportunity scoring (trend × your-data), Brand Voice RAG, OpenRouter free tier with fallback chain, lazy generation, Redis caching. Every decision defensible.

3. **Demo impact**
   → Open dashboard: live news feed. Show 30-day report: real numbers from real page. Click "Generate Content": 5 formats appear in 10 seconds in Banglish. Ask a question in chat: data-grounded answer in 6 seconds. Judges see a working product, not a mockup.

4. **Real-world scalability**
   → $0 AI cost. $0 API cost. Platform analytics cached so 100 users cost same as 1. Architecture documented. Monorepo + OpenAPI spec = team worked like professionals.

5. **Presentation clarity**
   → One sentence: "Growth Studio combines what's trending in tech with what works on YOUR channels — and generates a full week of content across Facebook, YouTube, and LinkedIn in 5 minutes, for free."