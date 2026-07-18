## Why

The vision wants a "Canva for content writers… just click, tweak, copy paste with no extra effort" (V3/V8), but today's `/dashboard/feed` is a literal "Coming soon" placeholder. Every backend capability shipped in plans 4-7 (full content, category subscriptions, style packs, per-format generation, fact-grounding) is invisible until the frontend surfaces it. This change ships the first visible piece: a real, daily.dev-style trend feed backed by the existing `GET /news-items` API, with a detail view that hands off into content generation.

## What Changes

- New `lib/api/news.ts`: typed `NewsItemDto`, `getNewsItems(params)` (via `apiGetList`, supporting `searchTerm`/`category`/`sort`/`page`/`limit`/`team_id`), `getNewsItem(id)`.
- New `lib/constants.ts`: the fixed six-category taxonomy (mirroring the backend's `NEWS_CATEGORIES`) plus a sort-options map.
- `/dashboard/feed` becomes a real page: a sticky controls row (category tabs over "All" + the six categories, an explicit sort select — Opportunity/Trending/Newest, since the backend's default sort is a no-op — and a 300ms-debounced search box) over a responsive card grid.
- `NewsCard`: title, source badge, relative age, category chip (override-aware), trend + opportunity 0-10 meters, a distinct emerald treatment for `high_opportunity` items, engagement counts, a 3-line snippet clamp.
- Clicking a card opens a detail Sheet (`NewsItemDrawer`): full metadata, the "why it matters" impact note, a scrollable content preview (full stored `content` when available, snippet otherwise), a source link, and a primary "✨ Generate content" CTA that navigates to `/dashboard/generate` carrying the item's id and title as router state.
- Load-more pagination driven by the response `meta`, skeleton loading state, error state with retry, empty state (distinguishing "nothing ingested yet" from "no matches for the current filters"), react-query caching keyed by the active filter set.
- Fully responsive down to 375px, dark-mode-first (matching the existing design tokens).
- Corrects `CLAUDE.md`'s stale frontend file-structure section, which still describes a `pages/dashboard/Layout.tsx` file and a `lib/mock/{news,report,content,chat}.ts` set that don't exist, to match the real `routes/`-array-driven structure — so future agent work in this repo starts from an accurate map.

## Capabilities

### New Capabilities
- `frontend-feed`: the trend feed page and its detail drawer — browsing, filtering, and the generate hand-off.

## Impact

- Frontend: new `lib/api/news.ts`, `lib/constants.ts`, `components/feed/{ScoreMeter,NewsCard,FeedControls,NewsItemDrawer}.tsx`, rewritten `pages/dashboard/Feed.tsx`. No routing change needed — `/dashboard/feed` is already wired in `routes/user.routes.tsx`, only the page component changes.
- `CLAUDE.md`: frontend file-structure section corrected in the same change.
- No backend changes — this change consumes `GET /news-items` and `GET /news-items/:id` exactly as they exist today (already gaining `content`/`content_status` and subscription-aware filtering from plans 4A/5A, both already applied).
- No new dependencies — debounce is a small local hook (no debounce library is currently installed), pagination/query caching use the already-installed `@tanstack/react-query`.
