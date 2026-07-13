## Context

The news feed is the primary screen of Growth Studio's dashboard. It surfaces AI-scored, filtered tech news items so the marketing team can spot trending topics and high-opportunity content ideas at a glance. The frontend is Next.js 16 (App Router) with Tailwind v4 and shadcn/ui. There is no backend ready yet — all data is hardcoded mock until the July 15 API wiring pass.

## Goals / Non-Goals

**Goals:**
- Ship a fully interactive news feed UI against mock data
- Match the real API response shape in mock data so the July 15 swap is a one-liner
- Support category filtering and sort without any server round-trip
- Show trend and opportunity badges based on score fields in the data
- Fit the existing dark glassmorphism visual language established by the landing page

**Non-Goals:**
- Real API calls (deferred to `api-wiring` change on July 15)
- Pagination or infinite scroll (mock has ~20 items; enough for demo)
- Search / full-text filtering
- Any backend work

## Decisions

**Mock data shape matches API contract**
Mock items in `frontend/lib/mock/news.ts` export a `MockNewsItem[]` typed with the same fields the real `/api/news` endpoint will return (`id`, `title`, `source`, `url`, `snippet`, `category`, `published_at`, `trend_score`, `opportunity_score`, `relevance_score`). This means the July 15 swap only changes the data source, not the components.

**Client-side filter + sort**
With ≤30 mock items, filtering and sorting happen in-memory via `useMemo`. No server actions, no route changes. Tab state is stored in `useState` — no URL params needed for the mock phase.

**Component structure**
```
frontend/components/news-feed/
├── NewsFeed.tsx          — top-level: tabs + sort + grid
├── NewsCard.tsx          — individual card
├── CategoryTabs.tsx      — tab bar
└── SortSelect.tsx        — sort dropdown
frontend/app/dashboard/
└── page.tsx              — imports NewsFeed, passes mock data
frontend/lib/mock/
└── news.ts               — MOCK_NEWS_ITEMS array + NewsItem type
```

**Badge thresholds**
- 🔥 Trending: `trend_score >= 7` (matches backend definition in FR-04)
- High opportunity: `opportunity_score >= 7` (mirrors backend scoring in FR-24)

**shadcn/ui Card as base**
`NewsCard` wraps shadcn's `Card` component and extends it with custom badge overlays and a hover-reveal "Generate content" button. No new UI primitives needed.

## Risks / Trade-offs

- **API shape drift** → Mock type is defined once in `news.ts`; if Robayat's OpenAPI contract differs, one file needs updating before the wiring pass.
- **No real data** → Demo uses hardcoded items. Judges see the UI only; scores and badges are illustrative.
- **Client filtering** → Fine for mock phase. When real API lands, filtering could move server-side for performance if item count grows large.
