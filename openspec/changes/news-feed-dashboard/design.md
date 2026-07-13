## Context

The Growth Studio dashboard is a five-screen single-page application behind a shared sidebar layout. It surfaces AI-scored tech news, multi-platform analytics, a content generator, a conversational assistant, and demo control buttons — all backed by realistic mock data. The frontend is Next.js 16 (App Router) with Tailwind v4 and shadcn/ui. There is no backend ready yet — all data is hardcoded mock until the July 15 API wiring pass.

## Goals / Non-Goals

**Goals:**
- Ship all five screens as fully interactive UIs against mock data
- Match the real API response shapes in mock data so the July 15 swap is a one-liner per screen
- Fit the existing dark glassmorphism visual language established by the landing page
- All screens responsive down to 375px mobile

**Non-Goals:**
- Real API calls (deferred to `api-wiring` change on July 15)
- Authentication / user accounts
- Pagination or infinite scroll (mock data is sufficient for demo)
- Any backend work

## Decisions

### Mock data shape matches API contract

Each mock file in `frontend/lib/mock/` exports a typed array and the type definition. The type fields exactly mirror what the real API endpoints will return. The July 15 wiring pass only changes the import — nothing in components needs to change.

### Client-side filter + sort (feed)

With ≤30 mock items, filtering and sorting happen in-memory via `useMemo`. No server actions, no route changes. Tab and sort state live in `useState`.

### Mock generation delay (content generator)

Content generation uses a `setTimeout` of 1200ms before revealing mock content so the skeleton + loading state is visible during the demo. A `isGenerating` boolean drives the skeleton state.

### Mock chat responses

Chat replies are selected from a static array of pre-written responses keyed to topic keywords. A 1800ms delay simulates streaming. The typing indicator (three animated dots) shows during the delay.

### shadcn/ui as the primary component layer

All cards, badges, tabs, inputs, separators, scroll areas, and toasts use shadcn primitives. Custom styling is always via Tailwind utilities layered on top — never by modifying the shadcn files.

## Component Structure

```
frontend/
├── app/
│   └── (dashboard)/
│       ├── layout.tsx                    — sidebar layout (AppSidebar + SidebarInset)
│       └── dashboard/
│           ├── page.tsx                  — redirects → /dashboard/feed
│           ├── feed/page.tsx             — server component: imports NewsFeed, passes MOCK_NEWS_ITEMS
│           ├── generate/page.tsx         — server component: imports ContentGenerator
│           ├── report/page.tsx           — server component: imports ReportView, passes MOCK_REPORT
│           ├── chat/page.tsx             — server component: imports ChatPanel
│           └── admin/page.tsx            — server component: imports AdminPanel
│
├── components/
│   ├── feed/
│   │   ├── constants.ts                  — CATEGORIES array, SortOption type
│   │   ├── CategoryTabs.tsx              — animated tab bar (Framer Motion layoutId)
│   │   ├── SortSelect.tsx                — sort dropdown
│   │   ├── NewsCard.tsx                  — individual card with badges and CTA
│   │   └── NewsFeed.tsx                  — top-level: tabs + sort + staggered card grid
│   │
│   ├── generate/
│   │   ├── ContentGenerator.tsx          — "use client" — topic input, generate button, format tabs
│   │   ├── FormatTabs.tsx                — tab bar for 5 content formats
│   │   ├── FormatPanel.tsx               — content area for one format (text + copy button)
│   │   └── GenerateSkeleton.tsx          — skeleton that shows during fake 1200ms delay
│   │
│   ├── report/
│   │   ├── ReportView.tsx                — "use client" — assembles the full report layout
│   │   ├── OverviewStats.tsx             — four stat cards: reach, engagements, views, avg rate
│   │   ├── PlatformSection.tsx           — expandable section per platform (Facebook/YouTube/LinkedIn)
│   │   ├── MiniSparkline.tsx             — inline SVG bar chart (no external chart lib needed)
│   │   ├── AIInsightBlock.tsx            — AI narrative block with gradient border
│   │   └── OpportunityList.tsx           — ranked content opportunity cards
│   │
│   ├── chat/
│   │   ├── ChatPanel.tsx                 — "use client" — message thread + input bar
│   │   ├── MessageBubble.tsx             — user (right) or assistant (left) bubble
│   │   └── TypingIndicator.tsx           — three animated dots
│   │
│   ├── shared/
│   │   ├── EmptyState.tsx                — icon + heading + optional sub-text
│   │   └── PageHeader.tsx                — page title + optional subtitle used by all screens
│   │
│   └── landing/                          — existing, unchanged
│
└── lib/
    └── mock/
        ├── news.ts                       — NewsItem type + MOCK_NEWS_ITEMS (18 items)
        ├── content.ts                    — GeneratedContent type + MOCK_CONTENT keyed by topic slug
        ├── report.ts                     — Report type + MOCK_REPORT (30-day cross-platform data)
        └── chat.ts                       — ChatMessage type + MOCK_RESPONSES array
```

## Screen Designs

### 1. Feed (`/dashboard/feed`)

**Layout:** Full-width with `PageHeader` ("What's Trending"), then `CategoryTabs` + `SortSelect` in a flex row, then the card grid.

**Grid:** `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` — Framer Motion stagger container, each card a `motion.div` child with `staggerChildren: 0.05`.

**NewsCard anatomy:**
```
┌─────────────────────────────────┐
│ [🔥 Trending] [High Opportunity]│  ← badges, top-right overlay
│                                 │
│ Title (linked, 2-line clamp)    │
│ source · 3h ago                 │
│                                 │
│ Snippet (2-line clamp, muted)   │
│ Impact note (1 line, xs muted)  │
│                                 │
│ [Category badge]  [Generate →]  │
└─────────────────────────────────┘
```
- `hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5`
- 🔥 badge: `text-amber-400 border-amber-500/30` with `animate-pulse`
- High opportunity badge: `text-emerald-400 border-emerald-500/30`
- "Generate →" navigates to `/dashboard/generate?topic=<encoded title>`

### 2. Content Generator (`/dashboard/generate`)

**Layout:** `PageHeader` ("Generate Content"), topic input row, then `FormatTabs` + `FormatPanel` below.

**Topic input:** shadcn `Input` pre-filled from `?topic=` URL param via `useSearchParams()`. "Generate" button triggers the 1200ms fake delay then reveals content.

**Format tabs:** All / FB Post / Reel Script / LinkedIn / YouTube Idea / Caption — shadcn `Tabs`. Default: "All" shows all 5 panels stacked. Individual tabs show one.

**FormatPanel anatomy:**
```
┌─────────────────────────────────┐
│ Facebook Post          [Copy ✓] │
├─────────────────────────────────┤
│ Generated text content...       │
│ (pre-wrap, scrollable)          │
└─────────────────────────────────┘
```
- Copy button uses `navigator.clipboard.writeText()` + Sonner toast "Copied!"
- Skeleton (`GenerateSkeleton`) shows during generation: 3 pulsing lines per panel

**Empty state:** Before any generation, show a centered `EmptyState` with `Sparkles` icon and "Enter a topic above to generate content".

### 3. Report (`/dashboard/report`)

**Layout:** `PageHeader` ("30-Day Performance Report" + last-refreshed timestamp from mock), then `OverviewStats` row, then three collapsible `PlatformSection` blocks, then `AIInsightBlock`, then `OpportunityList`.

**OverviewStats:** Four `glass-card` stat cards in `grid grid-cols-2 md:grid-cols-4 gap-4`:
- Total Reach / Total Engagements / Total Video Views / Avg Engagement Rate
- Each card: metric value (large, `gradient-text`), label, delta vs previous period (green/red)

**PlatformSection:** shadcn `Card` with platform icon + name in header, expand/collapse chevron. Expanded shows: top 3 posts list, best posting time, content type breakdown bar, `MiniSparkline` (7-day trend).

**MiniSparkline:** Inline SVG `<polyline>` — 7 data points, violet stroke, no axes, 60px × 24px. No chart library needed.

**AIInsightBlock:** `glass-card` with a `Sparkles` icon, heading "AI Cross-Platform Insight", and a paragraph of mock Banglish narrative. Left border: `border-l-2 border-violet-400`.

**OpportunityList:** Ranked list of 5 content opportunities, each a card row:
```
#1  React 19 Server Components         opportunity_score: 9.2
    YouTube video + Facebook Reel      [Generate →]
```

### 4. Chat (`/dashboard/chat`)

**Layout:** Full-height flex column: `PageHeader` + `ScrollArea` (message thread) + sticky input bar at bottom.

**ChatPanel state:** `messages: ChatMessage[]` (starts with an assistant greeting), `input: string`, `isTyping: boolean`.

**MessageBubble:** User messages right-aligned (`bg-violet-500/20 text-right`), assistant messages left-aligned (`glass-card`). Assistant bubble renders the `impact_note`-style text with line breaks.

**Typing indicator:** Three `motion.div` dots with staggered `y` bounce animation — shows while `isTyping === true`.

**Input bar:** shadcn `Input` + "Send" `Button`. On submit: append user message, set `isTyping = true`, after 1800ms pick mock response and append, set `isTyping = false`.

**Starter prompts:** Below the greeting, show 3 clickable prompt chips that pre-fill the input:
- "এই সপ্তাহে AI নিয়ে কোন news আছে?"
- "আমাদের Facebook এ কোন post সবচেয়ে ভালো?"
- "React 19 নিয়ে YouTube video করা উচিত?"

### 5. Admin (`/dashboard/admin`)

**Layout:** `PageHeader` ("Admin Controls"), two action cards side by side on md+, stacked on mobile.

**Action card anatomy:**
```
┌─────────────────────────────────┐
│ ⚡ Run News Ingestion            │
│ Pulls latest news from all      │
│ sources and runs the pipeline.  │
│                                 │
│ Last run: 2 hours ago    [Run]  │
│ Status: ● Idle                  │
└─────────────────────────────────┘
```
- "Run" button: on click → button shows spinner + "Running…" for 2000ms → Sonner toast "Ingestion triggered successfully" → status badge → "● Complete"
- Second card: "Refresh Analytics" — same pattern, toast "Analytics refresh triggered"
- Status badge colors: Idle `text-muted-foreground`, Running `text-amber-400 animate-pulse`, Complete `text-emerald-400`

## Mock Data Shapes

### `news.ts`
```ts
export type NewsItem = {
  id: string
  title: string
  source: string
  url: string
  snippet: string
  category: "AI" | "Web Dev" | "Career" | "Security" | "DevOps" | "Other"
  published_at: string        // ISO 8601
  trend_score: number         // 0–10
  opportunity_score: number   // 0–10
  relevance_score: number     // 0–10
  is_hot: boolean             // trend_score >= 7
  is_opportunity: boolean     // opportunity_score >= 7
  impact_note: string
}
export const MOCK_NEWS_ITEMS: NewsItem[]
```

### `content.ts`
```ts
export type GeneratedContent = {
  topic: string
  facebook_post: string
  facebook_reel_script: string
  linkedin_post: string
  youtube_idea: { title: string; hook: string; chapters: string[]; thumbnail_concept: string }
  caption: string
}
export const MOCK_CONTENT: GeneratedContent[]   // 3–4 entries for common demo topics
```

### `report.ts`
```ts
export type PlatformSummary = {
  platform: "facebook" | "youtube" | "linkedin"
  reach: number
  engagements: number
  views: number
  engagement_rate: number
  delta_reach: number         // % vs previous period
  delta_engagement: number
  top_posts: { title: string; reach: number; engagement: number; format: string }[]
  best_time: string           // e.g. "7–9pm on weekdays"
  sparkline: number[]         // 7 values
  content_breakdown: { format: string; avg_engagement_rate: number }[]
}
export type Report = {
  period: { start: string; end: string }
  overview: { total_reach: number; total_engagements: number; total_views: number; avg_engagement_rate: number }
  platforms: PlatformSummary[]
  ai_insight: string          // Banglish narrative paragraph
  opportunities: { rank: number; topic: string; formats: string[]; opportunity_score: number; reason: string }[]
  generated_at: string
}
export const MOCK_REPORT: Report
```

### `chat.ts`
```ts
export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
}
export const MOCK_RESPONSES: { keywords: string[]; response: string }[]
export const INITIAL_MESSAGE: ChatMessage   // greeting from assistant
```

## Risks / Trade-offs

- **API shape drift** → Each mock type is defined once in its file; if the API contract changes before July 15, one file updates and all components follow.
- **No real data** → Demo uses hardcoded items. Judges see the UI; scores and badges are illustrative.
- **MiniSparkline without a chart lib** → SVG polyline is sufficient for 7 data points and keeps the bundle lean. If more complex charts are needed for the report, add `recharts` (already in the stack decision for `report-ui`).
- **Client filtering** → Fine for mock phase. When real API lands, filtering can move server-side if item count scales.
