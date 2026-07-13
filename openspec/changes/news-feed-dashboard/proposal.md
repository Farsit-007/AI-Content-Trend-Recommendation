## Why

Growth Studio's value to the Programming Hero marketing team only lands if the entire workflow is visible in one place: what's trending externally, how their own channels are performing, how to generate content from that intersection, and a way to ask ad-hoc questions. Without all five dashboard screens built and demo-ready, the platform has no coherent story for judges or end users.

## What Changes

- Build a complete Growth Studio dashboard with five screens, all backed by mock data, behind a shared sidebar layout
- **Feed** (`/dashboard/feed`) — daily.dev-style news card grid with category tabs, sort controls, trend 🔥 and High Opportunity badges, and "Generate content" CTAs
- **Generate** (`/dashboard/generate`) — topic input (pre-filled from feed CTA URL param), five format tabs (FB Post, Reel Script, LinkedIn, YouTube Idea, Caption), skeleton loading, copy-to-clipboard per format
- **Report** (`/dashboard/report`) — overview stat row, per-platform sections (Facebook, YouTube, LinkedIn) with trend sparklines, AI insight block, ranked content opportunity list
- **Chat** (`/dashboard/chat`) — "Ask Growth Studio" message thread with user + assistant bubbles, typing indicator, mock RAG responses grounded in news and analytics context
- **Admin** (`/dashboard/admin`) — action cards for manual ingestion trigger (FR-25) and manual analytics refresh (FR-26) with status badges and toast feedback
- Mock data for all screens in `frontend/lib/mock/` mirroring the real API shape for a zero-friction swap on July 15

## Capabilities

### New Capabilities

- `news-feed-dashboard`: Browsable, filterable news feed — card grid, category tabs, sort, trend and opportunity badges, mock-data-backed
- `content-generator-ui`: Topic → five platform-specific content formats in one click, copy-to-clipboard, mock generation with realistic delay
- `report-ui`: Unified 30-day cross-platform analytics view — overview stats, per-platform breakdowns, AI-generated insight, ranked content opportunities
- `chat-ui`: Conversational interface for asking questions about news and analytics in Banglish/English, mock RAG responses
- `admin-triggers-ui`: Manual ingestion and analytics refresh buttons with status feedback for demo control

### Modified Capabilities

- `sidebar-layout`: Header row gains a search hint and user avatar placeholder; nav highlights the active screen

## Impact

- New files:
  - `frontend/app/(dashboard)/layout.tsx` — shared sidebar layout
  - `frontend/app/(dashboard)/dashboard/feed/page.tsx`
  - `frontend/app/(dashboard)/dashboard/generate/page.tsx`
  - `frontend/app/(dashboard)/dashboard/report/page.tsx`
  - `frontend/app/(dashboard)/dashboard/chat/page.tsx`
  - `frontend/app/(dashboard)/dashboard/admin/page.tsx`
  - `frontend/components/feed/` — news feed components (NewsFeed, NewsCard, CategoryTabs, SortSelect)
  - `frontend/components/generate/` — content generator components
  - `frontend/components/report/` — report and chart components
  - `frontend/components/chat/` — chat UI components
  - `frontend/components/shared/` — shared empty/loading states
  - `frontend/lib/mock/news.ts`, `content.ts`, `report.ts`, `chat.ts`
- Modified: `frontend/components/landing/Navbar.tsx` — adds Dashboard nav link
- No backend dependency — all data is hardcoded mock until July 15 API wiring pass
- Covers FR-05, FR-09–17, FR-21–26
