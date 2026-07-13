## Why

The Growth Studio dashboard needs a central news feed so the marketing team can see what's trending in tech — ranked by relevance, filtered by category, and flagged when a topic represents a high-opportunity moment for their channels. Without this screen, the platform has no usable entry point for the content workflow.

## What Changes

- Add a new `/dashboard` route with a news feed as its primary view
- Render news items as cards in a daily.dev-style grid layout
- Add category tabs (All, AI, Web Dev, Career, Security, DevOps, Other)
- Add sort controls (Trending, Latest, Relevance)
- Show a 🔥 badge on cards where `trend_score >= 7`
- Show a "High opportunity" badge on cards where `opportunity_score` is high
- Add mock data in `frontend/lib/mock/news.ts` that mirrors the real API shape
- Wire a "Generate content" CTA on each card (navigates to content generator)

## Capabilities

### New Capabilities

- `news-feed-dashboard`: Browsable, filterable news feed UI — card grid, category tabs, sort, trend and opportunity badges, mock-data-backed

### Modified Capabilities

_(none — this is a net-new screen)_

## Impact

- New files: `frontend/app/dashboard/page.tsx`, `frontend/components/news-feed/`, `frontend/lib/mock/news.ts`
- Appends one nav link to `frontend/components/landing/Navbar.tsx`
- No backend dependency — all data is hardcoded mock until July 15 API wiring pass
- Covers FR-05 (trend feed) and FR-24 (opportunity badge UI)
