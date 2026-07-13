## 1. Mock Data

- [ ] 1.1 Create `frontend/lib/mock/` directory
- [ ] 1.2 Create `frontend/lib/mock/news.ts` — define `NewsItem` type with fields: `id`, `title`, `source`, `url`, `snippet`, `category`, `published_at`, `trend_score`, `opportunity_score`, `relevance_score`
- [ ] 1.3 Add `MOCK_NEWS_ITEMS` array with 18 realistic items spanning all 6 categories (AI, Web Dev, Career, Security, DevOps, Other), including at least 4 items with `trend_score >= 7` and 3 with `opportunity_score >= 7`

## 2. Dashboard Page

- [ ] 2.1 Create `frontend/app/dashboard/` directory
- [ ] 2.2 Create `frontend/app/dashboard/page.tsx` — server component that imports `NewsFeed` and passes `MOCK_NEWS_ITEMS` as prop

## 3. NewsItem Type + Category Constants

- [ ] 3.1 Create `frontend/components/news-feed/` directory
- [ ] 3.2 Define `CATEGORIES` constant array: `["All", "AI", "Web Dev", "Career", "Security", "DevOps", "Other"]`
- [ ] 3.3 Define `SORT_OPTIONS` constant: `Trending | Latest | Relevance`

## 4. CategoryTabs Component

- [ ] 4.1 Create `frontend/components/news-feed/CategoryTabs.tsx`
- [ ] 4.2 Render tab buttons for each category using shadcn Tabs or custom styled buttons
- [ ] 4.3 Highlight active tab, call `onSelect` callback on click

## 5. SortSelect Component

- [ ] 5.1 Create `frontend/components/news-feed/SortSelect.tsx`
- [ ] 5.2 Render a shadcn Select with options: Trending, Latest, Relevance
- [ ] 5.3 Call `onSort` callback on change

## 6. NewsCard Component

- [ ] 6.1 Create `frontend/components/news-feed/NewsCard.tsx`
- [ ] 6.2 Render shadcn Card with: title (linked to `url`), source name, relative time (`published_at`), category badge, snippet (2-line clamp)
- [ ] 6.3 Add 🔥 Trending badge when `trend_score >= 7`
- [ ] 6.4 Add "High opportunity" badge when `opportunity_score >= 7`
- [ ] 6.5 Add "Generate content" button that links to `/dashboard/generate?topic=<encoded title>`
- [ ] 6.6 Apply glassmorphism card style consistent with the landing page design (dark bg, border, subtle blur)

## 7. NewsFeed Component

- [ ] 7.1 Create `frontend/components/news-feed/NewsFeed.tsx`
- [ ] 7.2 Accept `items: NewsItem[]` prop
- [ ] 7.3 Add `useState` for active category (default: `"All"`) and sort (default: `"Trending"`)
- [ ] 7.4 Compute filtered + sorted items via `useMemo`
- [ ] 7.5 Render `CategoryTabs` + `SortSelect` in a header row
- [ ] 7.6 Render filtered items as a responsive grid of `NewsCard` components
- [ ] 7.7 Render empty state message when filtered list is empty

## 8. Navigation

- [ ] 8.1 Add "Dashboard" link to `navLinks` in `frontend/components/landing/Navbar.tsx` (append-only — do not reorder existing entries)

## 9. Quality Check

- [ ] 9.1 Run `cd frontend && npm run typecheck` — fix all type errors
- [ ] 9.2 Run `cd frontend && npm run lint` — fix all lint errors
- [ ] 9.3 Open `http://localhost:3000/dashboard` and verify: cards render, tabs filter, sort changes order, 🔥 badge appears, "High opportunity" badge appears
- [ ] 9.4 Check mobile layout — single column, no horizontal overflow
