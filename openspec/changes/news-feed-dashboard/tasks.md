## 1. Mock Data — News Feed

- [x] 1.1 Create `frontend/lib/mock/` directory
- [x] 1.2 Create `frontend/lib/mock/news.ts` — define `NewsItem` type with fields: `id`, `title`, `source`, `url`, `snippet`, `category`, `published_at`, `trend_score`, `opportunity_score`, `relevance_score`, `is_hot` (trend_score >= 7), `is_opportunity` (opportunity_score >= 7), `impact_note`
- [x] 1.3 Add `MOCK_NEWS_ITEMS` array with 18 realistic items spanning all 6 categories (AI, Web Dev, Career, Security, DevOps, Other), including at least 4 items with `trend_score >= 7` and 3 with `opportunity_score >= 7`

## 2. App Shell — Dashboard Route Group

- [x] 2.1 Create `frontend/app/(dashboard)/` route group directory
- [x] 2.2 Create `frontend/app/(dashboard)/layout.tsx` — sidebar layout using shadcn `Sidebar` component with nav items: Feed `/dashboard/feed`, Generate `/dashboard/generate`, Report `/dashboard/report`, Chat `/dashboard/chat`, Admin `/dashboard/admin`
- [x] 2.3 Create `frontend/app/(dashboard)/dashboard/feed/` directory
- [x] 2.4 Create `frontend/app/(dashboard)/dashboard/feed/page.tsx` — server component that imports `NewsFeed` and passes `MOCK_NEWS_ITEMS`

## 3. Feed Constants

- [x] 3.1 Create `frontend/components/feed/` directory
- [x] 3.2 Create `frontend/components/feed/constants.ts` — export `CATEGORIES` array: `["All", "AI", "Web Dev", "Career", "Security", "DevOps", "Other"]` and `SORT_OPTIONS` type: `"Trending" | "Latest" | "Relevance"`

## 4. CategoryTabs Component

- [x] 4.1 Create `frontend/components/feed/CategoryTabs.tsx`
- [x] 4.2 Use Framer Motion `layoutId="tab-indicator"` sliding underline for the active tab
- [x] 4.3 Accept `active: string` and `onSelect: (cat: string) => void` props; render a tab button per category

## 5. SortSelect Component

- [x] 5.1 Create `frontend/components/feed/SortSelect.tsx`
- [x] 5.2 Render a native `<select>` styled with Tailwind (or a custom dropdown) with options: Trending, Latest, Relevance — call `onSort` on change

## 6. NewsCard Component

- [x] 6.1 Create `frontend/components/feed/NewsCard.tsx`
- [x] 6.2 Use shadcn `Card` + Framer Motion `whileHover={{ scale: 1.01 }}` with `hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5`
- [x] 6.3 Render: title linked to `url`, source name, relative time from `published_at`, shadcn `Badge` for category
- [x] 6.4 Render 2-line clamped snippet (`line-clamp-2`)
- [x] 6.5 Add 🔥 Trending badge (`text-amber-400 border-amber-500/30`) with animated pulse when `item.is_hot === true`
- [x] 6.6 Add "High opportunity" badge (`text-emerald-400`) when `item.is_opportunity === true`
- [x] 6.7 Show `impact_note` in a small muted line below snippet
- [x] 6.8 Add "Generate content" button (shadcn `Button` size="sm") linking to `/dashboard/generate?topic=<encoded title>`

## 7. NewsFeed Component

- [x] 7.1 Create `frontend/components/feed/NewsFeed.tsx` — `"use client"` component
- [x] 7.2 Accept `items: NewsItem[]` prop
- [x] 7.3 Add `useState` for `activeCategory` (default `"All"`) and `sort` (default `"Trending"`)
- [x] 7.4 Compute filtered + sorted items via `useMemo`
- [x] 7.5 Render `CategoryTabs` + `SortSelect` in a header row
- [x] 7.6 Wrap card grid in Framer Motion `variants` container with `staggerChildren: 0.05` — each `NewsCard` is a `motion.div` child
- [x] 7.7 Render responsive grid: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`
- [x] 7.8 Render empty state when filtered list is empty

## 8. Navigation

- [x] 8.1 Add `{ label: "Dashboard", href: "/dashboard/feed" }` to `navLinks` in `frontend/components/landing/Navbar.tsx`

## 9. Feed Quality Check

- [x] 9.1 Run `cd frontend && npm run typecheck` — fix all type errors
- [x] 9.2 Run `cd frontend && npm run lint` — fix all lint errors
- [x] 9.3 Start dev server and open `http://localhost:3000/dashboard/feed` — verify: sidebar renders, cards render, tabs filter, sort changes order, 🔥 badge appears, "High opportunity" badge appears, stagger animation plays
- [x] 9.4 Check mobile layout at 375px — single column, no horizontal overflow

## 10. Mock Data — Remaining Screens

- [x] 10.1 Create `frontend/lib/mock/content.ts` — define `GeneratedContent` type with fields: `topic`, `facebook_post`, `facebook_reel_script`, `linkedin_post`, `youtube_idea` (`title`, `hook`, `chapters[]`, `thumbnail_concept`), `caption`; export `MOCK_CONTENT: GeneratedContent[]` with 3–4 entries for common demo topics (e.g. "React 19", "AI in Bangladesh", "Web Dev Career 2026")
- [x] 10.2 Create `frontend/lib/mock/report.ts` — define `PlatformSummary` and `Report` types (see design.md for full shape); export `MOCK_REPORT: Report` with realistic 30-day numbers for Facebook, YouTube, LinkedIn including sparkline arrays and top posts
- [x] 10.3 Create `frontend/lib/mock/chat.ts` — define `ChatMessage` type (`id`, `role: "user" | "assistant"`, `content`, `timestamp`); export `INITIAL_MESSAGE: ChatMessage` (assistant greeting) and `MOCK_RESPONSES: { keywords: string[]; response: string }[]` with 6–8 entries covering common demo questions

## 11. Shared Components

- [x] 11.1 Create `frontend/components/shared/EmptyState.tsx` — accepts `icon: LucideIcon`, `heading: string`, `subtext?: string`; renders centered layout used by all screens
- [x] 11.2 Create `frontend/components/shared/PageHeader.tsx` — accepts `title: string`, `subtitle?: string`; renders `<h1>` with `gradient-text` and optional muted subtitle

## 12. Content Generator Screen

- [x] 12.1 Create `frontend/app/(dashboard)/dashboard/generate/page.tsx` — server component importing `ContentGenerator`, replacing the existing stub
- [x] 12.2 Create `frontend/components/generate/GenerateSkeleton.tsx` — renders 3 pulsing skeleton lines per format panel using shadcn `Skeleton`
- [x] 12.3 Create `frontend/components/generate/FormatPanel.tsx` — accepts `label: string`, `content: string`, `isLoading: boolean`; renders panel header + copy button + content area (or skeleton when loading); copy button calls `navigator.clipboard.writeText()` and fires a Sonner toast "Copied!"
- [x] 12.4 Create `frontend/components/generate/FormatTabs.tsx` — shadcn `Tabs` with values: `all | fb-post | reel-script | linkedin | youtube-idea | caption`; default `"all"`
- [x] 12.5 Create `frontend/components/generate/ContentGenerator.tsx` — `"use client"`:
  - Read `?topic=` from `useSearchParams()` and pre-fill the `Input`
  - `isGenerating: boolean` state; on Generate click set `true`, after 1200ms set `false` and set matched mock content (fall back to first entry if no keyword match)
  - Disable Generate button when input is empty or `isGenerating === true`
  - Render `PageHeader`, topic `Input` + Generate `Button`, `FormatTabs` wrapping five `FormatPanel` instances
  - Show `EmptyState` (Sparkles icon, "Enter a topic above") before first generation

## 13. Report Screen

- [x] 13.1 Create `frontend/app/(dashboard)/dashboard/report/page.tsx` — server component importing `ReportView` and passing `MOCK_REPORT`, replacing the existing stub
- [x] 13.2 Create `frontend/components/report/MiniSparkline.tsx` — inline SVG `<polyline>` rendering 7 data points; accepts `data: number[]`; 60×24px, violet stroke (`#8b5cf6`), no axes, no external chart lib
- [x] 13.3 Create `frontend/components/report/OverviewStats.tsx` — accepts `overview` and `platforms` from `Report`; renders 4 `glass-card` stat cards in `grid grid-cols-2 md:grid-cols-4 gap-4`; delta badge: green for positive, red for negative
- [x] 13.4 Create `frontend/components/report/PlatformSection.tsx` — accepts a `PlatformSummary`; collapsible shadcn `Card`; expanded shows top 3 posts list, best time string, `MiniSparkline`, content breakdown bars (simple `div` width % bars)
- [x] 13.5 Create `frontend/components/report/AIInsightBlock.tsx` — `glass-card` with `border-l-2 border-violet-400`, `Sparkles` icon, "AI Cross-Platform Insight" heading, and the `ai_insight` text (renders newlines)
- [x] 13.6 Create `frontend/components/report/OpportunityList.tsx` — renders ranked list of `opportunities`; each row shows rank, topic, format tags, opportunity score, reason, and a "Generate →" `Link` to `/dashboard/generate?topic=<encoded>`
- [x] 13.7 Create `frontend/components/report/ReportView.tsx` — `"use client"`, accepts `report: Report`; assembles `PageHeader` + `OverviewStats` + three `PlatformSection` blocks + `AIInsightBlock` + `OpportunityList`

## 14. Chat Screen

- [x] 14.1 Create `frontend/app/(dashboard)/dashboard/chat/page.tsx` — server component importing `ChatPanel`, replacing the existing stub
- [x] 14.2 Create `frontend/components/chat/TypingIndicator.tsx` — three `motion.div` dots with staggered `y` bounce (`animate={{ y: [0, -6, 0] }}`, staggerChildren 0.15s)
- [x] 14.3 Create `frontend/components/chat/MessageBubble.tsx` — accepts `message: ChatMessage`; user messages: right-aligned, `bg-violet-500/20`; assistant messages: left-aligned, `glass-card`; renders `content` with whitespace preserved
- [x] 14.4 Create `frontend/components/chat/ChatPanel.tsx` — `"use client"`:
  - State: `messages` (starts with `INITIAL_MESSAGE`), `input`, `isTyping`
  - On submit: append user message, set `isTyping = true`, after 1800ms pick best mock response (keyword match on input, fallback to last entry), append assistant message, set `isTyping = false`
  - Render: `PageHeader`, shadcn `ScrollArea` for thread (auto-scroll to bottom on new message via `useEffect` + `ref`), three starter prompt chips, sticky input row (`Input` + Send `Button`)
  - Starter prompts: "এই সপ্তাহে AI নিয়ে কোন news আছে?", "আমাদের Facebook এ কোন post সবচেয়ে ভালো?", "React 19 নিয়ে YouTube video করা উচিত?"

## 15. Admin Screen

- [x] 15.1 Create `frontend/app/(dashboard)/dashboard/admin/page.tsx` — server component importing `AdminPanel`, replacing the existing stub
- [x] 15.2 Create `frontend/components/admin/AdminPanel.tsx` — `"use client"`:
  - State per card: `status: "idle" | "running" | "complete"`
  - Two `glass-card` action cards side by side (`grid grid-cols-1 md:grid-cols-2 gap-4`):
    - **Run News Ingestion**: icon `Zap`, description, last-run "2 hours ago", Run `Button`
    - **Refresh Analytics**: icon `RefreshCw`, description, last-run "6 hours ago", Refresh `Button`
  - On button click: set `status = "running"`, button shows `Loader2` spinner + "Running…", after 2000ms set `status = "complete"`, fire Sonner toast with success message, status badge turns emerald "● Complete"
  - Status badge colors: idle `text-muted-foreground`, running `text-amber-400 animate-pulse`, complete `text-emerald-400`

## 16. Full Dashboard Quality Check

- [x] 16.1 Run `cd frontend && npm run typecheck` — fix all type errors across all new files
- [x] 16.2 Run `cd frontend && npm run lint` — fix all lint errors
- [x] 16.3 Start dev server — verify `/dashboard/generate`: topic pre-fills from URL param, skeleton shows on Generate, all 5 panels appear, copy-to-clipboard fires toast
- [x] 16.4 Verify `/dashboard/report`: stat cards with deltas, all 3 platform sections expand, sparkline renders, AI insight block present, opportunity list has Generate links
- [x] 16.5 Verify `/dashboard/chat`: greeting on load, starter prompt fills input, user message appears instantly, typing indicator shows, assistant reply appears after delay
- [x] 16.6 Verify `/dashboard/admin`: Run button shows spinner, toast fires after 2s, status badge turns green; both cards are independent
- [x] 16.7 Check all 5 screens at 375px mobile — no horizontal overflow, sidebar collapses correctly
- [x] 16.8 Smoke test navigation: landing → Dashboard nav link → `/dashboard/feed`; sidebar links navigate between all 5 screens without full reload
