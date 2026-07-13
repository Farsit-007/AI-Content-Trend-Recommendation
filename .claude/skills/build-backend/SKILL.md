---
name: build-backend
description: Build a Growth Studio backend feature — Node.js + TypeScript, MongoDB Atlas, Redis, OpenRouter. Follows project conventions and data models.
argument-hint: "<change-name> — the OpenSpec change to implement (e.g. news-ingestion-pipeline)"
allowed-tools: Read, Write, Edit, Glob, Bash(npm:*), Bash(node:*)
---

You are the backend engineer for Growth Studio — an AI Content & Trend Intelligence Platform.

Change to implement: $ARGUMENTS

Read `openspec/changes/$ARGUMENTS/tasks.md` first. Implement every task in order, checking each off as you go.

---

## Stack

| Layer | Tool |
|-------|------|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | MongoDB Atlas (Mongoose ODM) |
| Cache | Redis (ioredis) |
| LLM + Embeddings | OpenRouter free tier |
| Scheduler | node-cron |
| Vector Search | MongoDB Atlas `$vectorSearch` |

---

## Project Structure

```
backend/
├── src/
│   ├── shared/         # DB connections, Redis client, OpenRouter client, env config
│   ├── ingestion/      # News fetchers + filter pipeline + cron scheduler
│   ├── generation/     # Content generator + brand voice RAG
│   ├── rag/            # Ask Growth Studio chat
│   ├── analytics/      # FB / YouTube / LinkedIn fetchers
│   ├── reports/        # Cross-platform report generator
│   └── index.ts        # Express app entry point
```

---

## Environment Variables (read from process.env)

```ts
MONGODB_URI        // MongoDB Atlas connection string
REDIS_URL          // Redis connection URL
OPENROUTER_API_KEY // OpenRouter API key
FB_PAGE_TOKEN      // Facebook long-lived page access token
YOUTUBE_API_KEY    // YouTube Data API v3 key
LINKEDIN_TOKEN     // LinkedIn OAuth token
PORT               // Express port (default 3001)
```

Never hardcode secrets. Always use `process.env.*`.

---

## MongoDB Collections + Data Models

### news_items
```ts
{
  _id: ObjectId,
  source: string,           // "hackernews" | "devto" | "github" | "reddit" | "rss"
  source_id: string,
  content_hash: string,     // SHA256(title + url)
  title: string,
  url: string,
  snippet: string,
  published_at: Date,
  engagement: { points: number, comments: number, stars_delta: number },
  trend_score: number,      // math formula — no AI
  category: string,         // "AI" | "Web Dev" | "Career" | "Security" | "DevOps" | "Other"
  relevance_score: number,  // 1–10, AI-assigned
  impact_note: string,      // one sentence, AI-generated
  embedding: number[],      // 768-dim nomic-embed-text
  opportunity_score: number,
  processed: boolean,
  created_at: Date,
}
```

### platform_analytics
```ts
{
  _id: ObjectId,
  platform: "facebook" | "youtube" | "linkedin",
  period: { start: Date, end: Date },
  overview: { reach: number, engagements: number, views: number, engagement_rate: number },
  top_posts: Array<{ id: string, title: string, reach: number, engagement: number, format: string, published_at: Date }>,
  best_times: Array<{ hour: number, day: number, avg_reach: number }>,
  content_breakdown: Array<{ format: string, avg_engagement_rate: number }>,
  fetched_at: Date,
}
```

### platform_posts (for opportunity scoring)
```ts
{
  _id: ObjectId,
  platform: string,
  post_id: string,
  content_snippet: string,
  embedding: number[],      // 768-dim
  metrics: { reach: number, likes: number, comments: number, shares: number, views: number },
  published_at: Date,
  fetched_at: Date,
}
```

### brand_voice_examples
```ts
{
  _id: ObjectId,
  platform: string,
  category: string,
  content: string,
  embedding: number[],      // 768-dim
  engagement_hint: string,
  added_by: string,
  created_at: Date,
}
```

### generated_content
```ts
{
  _id: ObjectId,
  news_id: ObjectId,
  formats: {
    facebook_post: string,
    facebook_reel_script: string,
    linkedin_post: string,
    youtube_idea: { title: string, hook: string, chapters: string[], thumbnail_concept: string },
    caption: string,
  },
  opportunity_score: number,
  created_at: Date,
}
```

### reports
```ts
{
  _id: ObjectId,
  period: { start: Date, end: Date },
  overview: { total_reach: number, total_engagements: number, total_views: number, avg_engagement_rate: number },
  platform_summaries: { facebook: object, youtube: object, linkedin: object },
  ai_insight: string,       // Banglish narrative
  content_opportunities: Array<{ rank: number, topic: string, formats: string[], opportunity_score: number, reason: string }>,
  generated_at: Date,
}
```

---

## OpenRouter — LLM Calls

```ts
// Primary model for categorization + report + chat
const PRIMARY_MODEL = "meta-llama/llama-3.1-8b-instruct:free"
// Content generation
const GENERATION_MODEL = "mistralai/mistral-7b-instruct:free"
// Fallback
const FALLBACK_MODEL = "google/gemma-2-9b-it:free"
// Embeddings
const EMBED_MODEL = "nomic-ai/nomic-embed-text"

async function callLLM(prompt: string, model = PRIMARY_MODEL): Promise<string> {
  // POST https://openrouter.ai/api/v1/chat/completions
  // Authorization: Bearer ${OPENROUTER_API_KEY}
  // Always try PRIMARY, catch → try FALLBACK
}

async function embed(text: string): Promise<number[]> {
  // POST https://openrouter.ai/api/v1/embeddings
  // model: EMBED_MODEL
  // Returns 768-dim float array
}
```

Always batch LLM calls: 10 news items per call minimum. Never call LLM per-item in a loop.

---

## Redis Caching Patterns

```ts
// Cache key conventions
`news:${id}:generated`    // generated content — TTL 24h
`chat:${queryHash}`        // chat responses — TTL 10min
`report:30day`             // cross-platform report — TTL 6h
`analytics:${platform}`   // analytics data — TTL 6h
`dedup:${contentHash}`    // seen items — TTL 24h

// Always check cache before computing
const cached = await redis.get(key)
if (cached) return JSON.parse(cached)
// ... compute ...
await redis.setex(key, TTL_SECONDS, JSON.stringify(result))
```

---

## Vector Search — MongoDB Atlas $vectorSearch

```ts
// Semantic dedup
db.collection("news_items").aggregate([
  { $vectorSearch: {
    index: "news_embedding_index",
    path: "embedding",
    queryVector: newEmbedding,
    numCandidates: 20,
    limit: 1,
  }},
  { $project: { score: { $meta: "vectorSearchScore" }, title: 1 } }
])
// score > 0.9 → duplicate, skip

// Brand voice RAG (3 similar real posts)
db.collection("brand_voice_examples").aggregate([
  { $vectorSearch: {
    index: "brand_voice_index",
    path: "embedding",
    queryVector: topicEmbedding,
    numCandidates: 20,
    limit: 3,
  }}
])

// Opportunity scoring (10 similar platform posts)
db.collection("platform_posts").aggregate([
  { $vectorSearch: {
    index: "platform_posts_index",
    path: "embedding",
    queryVector: newsEmbedding,
    numCandidates: 50,
    limit: 10,
  }}
])
```

---

## Trend Score Formula (no AI)

```ts
function calcTrendScore(points: number, comments: number, publishedAt: Date): number {
  const normalize = (val: number, max: number) => Math.min(val / max, 1)
  const hoursOld = (Date.now() - publishedAt.getTime()) / 3_600_000
  const recencyDecay = Math.max(0, 1 - hoursOld / 48)

  return (
    normalize(points, 500)   * 4 +
    normalize(comments, 200) * 3 +
    recencyDecay             * 3
  )
}
// 🔥 badge when trend_score >= 7
```

---

## Cron Schedule

```ts
import cron from "node-cron"

cron.schedule("0 */3 * * *", () => runIngestionPipeline())   // every 3h
cron.schedule("0 */6 * * *", () => refreshAllAnalytics())    // every 6h
```

---

## API Endpoints (REST)

```
GET  /api/news                    → paginated feed (filter, sort params)
GET  /api/news/:id/content        → generated content (lazy, checks cache first)
POST /api/news/:id/generate       → trigger content generation
GET  /api/report                  → 30-day cross-platform report
GET  /api/chat                    → Ask Growth Studio (query param: q)
POST /api/admin/trigger-ingestion → manual ingestion run
POST /api/admin/trigger-analytics → manual analytics refresh
```

---

## Rules

- Always check Redis cache before calling OpenRouter
- Always batch LLM calls — never per-item
- Never hardcode API keys — use process.env
- Never call MongoDB without error handling
- Embeddings: always use `nomic-ai/nomic-embed-text` — consistent 768-dim across all 3 indexes
- Content hash for dedup: `crypto.createHash("sha256").update(title + url).digest("hex")`
- All routes must return `{ success: boolean, data?: any, error?: string }`
