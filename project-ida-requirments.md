# TrendBridge — Project Idea & Requirements Analysis
### Team Next Wave · AI Content & Trend Recommendation · Jul 12–18, 2026

---

## 1. The Problem (Why This Exists)

Programming Hero is a fast-growing edtech platform in Bangladesh. Their marketing team needs to:
- Stay updated on the latest tech trends (AI, Web Dev, Career, Security)
- Decide which trends matter for their students and brand
- Create engaging social media content about those trends
- Do this consistently, every day, across LinkedIn and Facebook

**The reality:** They are non-technical. They cannot tell the difference between a trending AI paper that will affect their curriculum and a random security CVE that doesn't matter to them. They spend hours manually browsing HackerNews, Dev.to, Twitter — and still miss things. When they finally find something, writing a good Banglish post about it takes another hour.

**The cost of this problem:**
- Trending topics missed → competitors post first
- Irrelevant content posted → low engagement, brand damage
- Hours wasted on research → less time on actual marketing work
- Inconsistent posting schedule → algorithmic penalty on LinkedIn/Facebook

---

## 2. The Solution — TrendBridge

> "TrendBridge closes the gap between what's happening in tech and what your marketing team should do about it — automatically."

TrendBridge is an AI-powered dashboard that:

1. **Watches** multiple tech sources 24/7 (HackerNews, Dev.to, GitHub Trending, Reddit, RSS)
2. **Filters** noise using a 4-layer pipeline — only relevant, non-duplicate, high-quality news reaches the surface
3. **Scores** each item by relevance to Programming Hero's audience and business context
4. **Explains** why each news item matters and what action to take (Impact Simulator)
5. **Generates** ready-to-post LinkedIn and Facebook content in Banglish, in PH's brand voice, in one click
6. **Answers** questions like "What AI news this week should we post about?" via a chat interface

The marketing team opens one dashboard. Everything they need is there. No technical knowledge required.

---

## 3. Who Uses This (User Personas)

### Persona 1: The Marketing Executive (Primary User)
- Name: Riya Apa, Marketing Team, Programming Hero
- Technical level: Zero. She knows Facebook and Canva.
- Daily pain: Spends 2 hours searching for "something to post about" and often gives up or reposts old content
- What she needs: Open the app, see what's trending that matters to PH, click generate, copy the post, done in 5 minutes
- Success metric: Posts 5x per week consistently without researching anything manually

### Persona 2: The Content Strategist (Secondary User)
- Name: Tanvir Bhai, Content & Growth, Programming Hero
- Technical level: Moderate. Understands tech surface-level.
- Daily pain: Has to brief the marketing team on what to post — takes time he doesn't have
- What he needs: A dashboard that does the briefing automatically, with business context per item
- Success metric: Team stops asking him "what should we post today?"

### Persona 3: The Course Manager (Tertiary User)
- Name: Sumaiya, Curriculum Team, Programming Hero
- Technical level: Low-moderate
- Occasional pain: Needs to know if a new framework or AI model should affect course content
- What she needs: Weekly digest of "what changed in tech that might affect our courses"
- Success metric: Never misses a major tech shift that should trigger a course update

---

## 4. Core Features (MVP Scope)

### Feature 1: Multi-Source News Aggregation
**What it does:** Pulls tech news from 4 sources every 3 hours, automatically.
**Sources:** HackerNews API, Dev.to API, OSS Insight (GitHub trending), Reddit (r/programming, r/webdev)
**Why free sources only:** No budget risk for a hackathon; all are reliable and well-documented.
**Output:** Raw news items stored in MongoDB with source, title, URL, snippet, engagement metrics.

---

### Feature 2: 4-Layer AI-Cost Filter
**What it does:** Reduces 200+ daily news items to the 20–30 that actually matter, before any AI model runs.
**Layer 1 — Keyword pre-filter:** Drop items with zero PH-relevant keywords (AI, React, Node, career, hiring, JavaScript, Python, web dev, course, learning). Pure string matching, zero cost.
**Layer 2 — Vector dedup (MongoDB Atlas Vector Search):** Generate a 768-dim embedding for each new item via `nomic-ai/nomic-embed-text` on OpenRouter (free). Run `$vectorSearch` against `news_items` collection. Cosine similarity > 0.9 with any existing item → same story, skip it. Embeddings stored directly on the MongoDB document — no separate vector DB, no new infrastructure.
**Layer 3 — Redis cache check:** SHA256(title + URL) checked against Redis. If seen in last 24h, skip. Zero cost.
**Layer 4 — Relevance gate:** Only items that pass layers 1–3 go to the LLM via OpenRouter. Items scoring below 4/10 after AI processing are stored but not surfaced or processed further.
**Why this matters:** This is what separates a naive "call LLM on everything" approach from a production-grade system. AI cost stays $0 as volume scales — free OpenRouter models + Atlas Vector Search on already-free MongoDB M0 + aggressive Redis caching.

---

### Feature 3: AI Categorization + Relevance Scoring
**What it does:** LLM via OpenRouter (batched, 10 items per API call) assigns each surviving news item:
- Category: AI / Web Dev / Career / Security / DevOps / Other
- Relevance score: 1–10 (how much does this matter to PH's students and marketing?)
- Impact note: One sentence — "Why this matters and what PH should consider."
**Model:** Free tier via OpenRouter — `meta-llama/llama-3.1-8b-instruct:free` for classification (fast, free, capable). Falls back to `mistralai/mistral-7b-instruct:free` if unavailable.
**Output:** Enriched news items in MongoDB, cached in Redis for 24h.

---

### Feature 4: Trend Score (Zero AI Cost)
**What it does:** Calculates a "trending potential" score from raw engagement signals — no AI involved.
**Formula:**
```
trend_score = normalize(points, 500) × 4
            + normalize(comments, 200) × 3
            + recency_decay × 3
```
Where recency_decay = max(0, 1 − hoursOld/48)
**Display:** 🔥 badge on cards when trend_score ≥ 7.
**Why no AI:** Judges respect "we used AI only where it added value." Pure math for a math problem shows architecture judgment.

---

### Feature 5: Impact Simulator
**What it does:** Per high-relevance news item, AI generates one concrete business suggestion for PH.
**Example output:** "React 19 released with built-in async transitions — consider updating the React module in Level 2 Web Course. Strong LinkedIn post angle: 'Bangladesh developers: here's what React 19 means for your job search.'"
**Why it's a killer feature:** It's not just "what's happening" — it's "what should WE do about it." This is business intelligence, not news aggregation. Judges feel the difference.

---

### Feature 6: One-Click AI Post Generator
**What it does:** Click "Generate Post" on any news card → OpenRouter LLM generates 3 variants:
- LinkedIn post (professional Banglish, storytelling hook, 150–200 words)
- Facebook post (casual Banglish, emoji-friendly, conversational)
- Short caption (under 50 words, works for Instagram/any platform)
**Brand voice baked into prompt:** Storytelling hook, no dashes, real examples, PH audience (students, job seekers), Banglish (not pure Bangla, not pure English).
**Lazy generation:** Never pre-generated. Only fires when user clicks. Result cached in Redis 24h so clicking again is instant.
**Copy to clipboard:** One click copies the post. Marketing team pastes into Facebook/LinkedIn directly.

---

### Feature 7: "Ask TrendBridge" Chat Interface
**What it does:** Marketing team types a question in plain language. TrendBridge answers using the real news database as context.
**Example questions:**
- "এই সপ্তাহে AI নিয়ে কোন news আছে যেটা আমরা post করতে পারি?"
- "What JavaScript news this week is relevant for our students?"
- "Is there anything about job market trends I should know?"
**How it works (RAG with MongoDB Atlas Vector Search):** User query → embed with `nomic-ai/nomic-embed-text` (free, OpenRouter) → `$vectorSearch` against `news_items` → top 5 semantically closest items → sent as context to OpenRouter LLM → plain language answer in Banglish. Semantic search means "AI tools for students" finds AI career news even if the exact words don't match.
**Why it's the demo wow moment:** Live interaction. Judges can type their own question. Nothing is more convincing than a real-time, unpredictable demo that works.

---

### Feature 8: Dashboard UI
**Style reference:** daily.dev — card-based, dark theme, tab filtering.
**Tabs:** Headlines / AI / Web Dev / Career / Security
**Each card shows:** Title, source, time ago, category badge, trend score 🔥, relevance score, 2-line impact note, "Generate Post" button.
**Sorting:** Latest / Most Relevant / Trending
**Search:** Simple keyword search across stored titles and snippets.

---

## 5. Requirements Analysis

### Functional Requirements

| ID | Requirement | Priority | Feature |
|---|---|---|---|
| FR-01 | System fetches news from ≥3 sources every 3 hours | Must Have | Aggregation |
| FR-02 | Duplicate news items are not shown (exact + semantic dedup) | Must Have | Filter |
| FR-03 | Each news item has a category, relevance score, and trend score | Must Have | AI + Trend |
| FR-04 | Items with relevance < 4 are not surfaced to users | Must Have | Filter |
| FR-05 | User can filter feed by category | Must Have | Dashboard |
| FR-06 | User can sort feed by latest / relevance / trend | Must Have | Dashboard |
| FR-07 | Each high-relevance item shows an Impact note | Must Have | Impact Simulator |
| FR-08 | User can generate a LinkedIn post from any card in one click | Must Have | Post Generator |
| FR-09 | User can generate a Facebook post and caption from any card | Must Have | Post Generator |
| FR-10 | Generated post is in Banglish with storytelling hook | Must Have | Post Generator |
| FR-11 | Generated post is cached — regenerating is instant | Should Have | Post Generator |
| FR-12 | User can copy generated post to clipboard | Must Have | Post Generator |
| FR-13 | User can ask a natural language question about current news | Should Have | Chat |
| FR-14 | Chat answers are grounded in real news items via vector RAG | Should Have | Chat |
| FR-15 | Post generator uses Brand Voice RAG — real PH posts as examples | Must Have | Post Generator |
| FR-16 | Semantic dedup prevents duplicate stories via vector similarity | Must Have | Filter |
| FR-17 | Dashboard shows a stats widget (items today, posts generated) | Nice to Have | Dashboard |
| FR-18 | Admin can manually trigger an ingestion run | Should Have | Demo tool |

### Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Feed load time | < 1.5 seconds (cached) |
| NFR-02 | Post generation time | < 8 seconds |
| NFR-03 | Chat response time | < 6 seconds |
| NFR-04 | Ingestion pipeline runs | Every 3 hours, unattended |
| NFR-05 | Mobile responsive | Yes — marketing team uses phones |
| NFR-06 | Works on demo day (Render cold start handled) | Yes — warm 5 min before |
| NFR-07 | AI model cost | $0 — all LLMs + embeddings via OpenRouter free tier |
| NFR-08 | No paid APIs or services required | Yes — all sources free, MongoDB M0, Upstash free, OpenRouter free |
| NFR-09 | Vector search latency | < 200ms — MongoDB Atlas Vector Search on M0 |
| NFR-10 | Embedding generation time per item | < 500ms — nomic-embed-text via OpenRouter |

---


## 5.5 AI Stack — OpenRouter Free Tier (Zero Cost)

All LLM calls go through **OpenRouter** using free models only. No paid API keys required.

### Model assignments

| Task | Model | Why |
|---|---|---|
| Batch categorization (classification) | `meta-llama/llama-3.1-8b-instruct:free` | Fast, free, handles structured JSON output reliably |
| Post generation (creative writing) | `mistralai/mistral-7b-instruct:free` | Strong instruction following, good Banglish output |
| Chat / Ask TrendBridge | `meta-llama/llama-3.1-8b-instruct:free` | Fast responses, good context handling |
| Fallback (if primary unavailable) | `google/gemma-2-9b-it:free` | Always-available backup |

### OpenRouter free tier limits
- Rate limit: ~20 requests/min per model on free tier
- Context window: 8k–32k tokens depending on model
- Mitigation: Redis caching means most requests never hit the API; batching (10 items/call) reduces total call count by 10×

### Brand Voice RAG (Banglish quality fix)
Claude and other LLMs write "textbook Banglish" — grammatically okay but not how PH's audience actually talks on Facebook and LinkedIn. Fix: inject 3–5 real PH posts as few-shot examples in every generation call.

**How it works:**
1. Marketing team manually collects 25–30 real PH Facebook/LinkedIn posts → stored in `brand_voice_examples` MongoDB collection with embeddings
2. On every "Generate Post" click → embed the news title → `$vectorSearch` against `brand_voice_examples` → fetch 3 most semantically similar real PH posts
3. Inject into system prompt: "Write in exactly this voice and style. Here are real examples from Programming Hero:"
4. LLM mirrors real PH voice instead of generic Banglish

**Why vector search here beats keyword match:** A news item about "React 19 Server Components" should match a PH post about "web development career tips" — same audience, similar vibe. Keyword match misses this; vector similarity catches it.

**Pitch line:** "Our AI doesn't just generate Banglish — it generates PH's Banglish, learned from their own real posts."

### `brand_voice_examples` schema
```js
{
  _id: ObjectId,
  platform: "facebook" | "linkedin",
  category: "ai" | "web" | "career" | "general",
  content: String,           // the actual post text
  embedding: [Number],       // 768-dim vector from nomic-embed-text (for $vectorSearch)
  engagement_hint: String,   // optional: "high engagement" / "low"
  added_by: String,
  created_at: Date
}
// Vector index: { path: "embedding", numDimensions: 768, similarity: "cosine" }
```

**Action item for Mursalin + Marketing team (today):**
- Go to PH's Facebook page and LinkedIn page
- Copy 30 recent posts that got good engagement
- Paste into a Google Sheet with columns: platform, category, content
- Give to Robayat to seed the MongoDB collection
- This takes 1 hour and makes the AI output dramatically better

---

## 5.6 Vector DB Architecture — MongoDB Atlas Vector Search

All vector operations run inside MongoDB Atlas M0 (free). Zero new infrastructure.

### Two vector indexes (both on Atlas M0)

**Index 1 — `news_items.embedding`**
```json
{
  "fields": [{
    "type": "vector",
    "path": "embedding",
    "numDimensions": 768,
    "similarity": "cosine"
  }]
}
```
Used for: semantic dedup (ingestion pipeline) + Ask TrendBridge RAG chat

**Index 2 — `brand_voice_examples.embedding`**
```json
{
  "fields": [{
    "type": "vector",
    "path": "embedding",
    "numDimensions": 768,
    "similarity": "cosine"
  }]
}
```
Used for: Brand Voice RAG (fetching similar PH posts for post generation)

### Embedding model
`nomic-ai/nomic-embed-text` via OpenRouter free tier.
- 768 dimensions
- Same OpenRouter client already used for LLM calls — no new SDK
- Called once per news item at ingestion time, result stored on document
- Called once per user query at chat time (not stored)
- Called once per "Generate Post" click for brand voice lookup (not stored)

### Three RAG flows

**Flow 1: Semantic dedup (ingestion)**
```
New item arrives
  → embed title+snippet (nomic-embed-text, OpenRouter free)
  → $vectorSearch news_items { numCandidates: 50, limit: 1 }
  → if top result score > 0.9 → duplicate, skip
  → else → new item, continue pipeline
```

**Flow 2: Ask TrendBridge chat**
```
User types question
  → embed question (nomic-embed-text)
  → $vectorSearch news_items { numCandidates: 100, limit: 5 }
  → top 5 items (title + snippet + impact_note) as context
  → send to OpenRouter LLM with question
  → return Banglish answer
  → cache in Redis 10 min (query hash as key)
```

**Flow 3: Brand Voice RAG (post generation)**
```
User clicks "Generate Post" on a news card
  → embed news title (nomic-embed-text)
  → $vectorSearch brand_voice_examples { numCandidates: 20, limit: 3 }
  → top 3 real PH posts as few-shot examples
  → inject into post generation system prompt
  → OpenRouter LLM generates LinkedIn + Facebook + Caption
  → cache result in Redis 24h
```

### Why this is better than keyword search
Keyword search finds "React 19" posts when searching "React 19". Vector search finds the right brand voice example for "React 19 Server Components" even if the example post says "web dev career growth" — same audience intent, same tone needed. This is the difference between a hackathon toy and a real product.

---

## 6. What Is Out of Scope (Stated as "Phase 2" in Pitch)

- User authentication and multi-workspace
- Publishing directly to LinkedIn/Facebook (API approvals take weeks)
- Analytics charts and historical trend graphs
- Slack/Discord notifications
- Weekly digest email
- Content calendar and scheduling
- White-label version
- Dedicated vector database (Pinecone, Weaviate) — MongoDB Atlas Vector Search covers all needs for free

Mentioning these in the pitch as "what comes next" shows product vision without burning build time.

---

## 7. Success Criteria for Judges

The judges will evaluate:

1. **Problem-solution fit** — Is the problem real? Does this solve it completely?
   → Yes. PH's own marketing team is the user. The problem statement came from inside the company.

2. **Technical depth** — Is this "just a ChatGPT wrapper"?
   → No. 4-layer filter pipeline, MongoDB Atlas Vector Search for dedup + RAG, Brand Voice RAG with real PH posts as few-shot examples, Redis caching, batched LLM calls via OpenRouter free tier, lazy generation, Trend Score formula. Every decision is defensible and cost-justified.

3. **Demo impact** — Does it work live? Is it impressive?
   → Feed loads with real data. Impact note explains business context. Post generates in Banglish in < 8 seconds. Chat answers a live question from the judge.

4. **Real-world scalability** — Would this survive actual use?
   → Yes. $0 AI cost via OpenRouter free tier. Aggressive Redis caching means the 100th user costs nothing extra. Architecture is documented and clean.

5. **Presentation clarity** — Can you explain it simply?
   → One sentence: "TrendBridge turns tech news into ready-to-post content for non-technical marketing teams — in under 60 seconds."