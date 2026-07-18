## Context

`GET /news-items` (`newsItem.route.ts`, `optionalAuth`) accepts `searchTerm`, `category`, `sort`, `page`, `limit`, `team_id` and returns `{ meta: {page,total,limit,totalPage}, data: NewsItem[] }` via the standard success envelope (`apiGetList` already unwraps this). `QueryBuilder.sort()` defaults to `-createdAt` when no `sort` is passed — the actual timestamp field is `created_at`, so that default is a silent no-op; every request from this page must pass an explicit `sort`. List responses omit `embedding` and `content` (kept light); `GET /news-items/:id` includes `content` but still omits `embedding`. Each item carries `is_overridden` (team category override applied) and, when a team context resolved, `high_opportunity` (boolean) — both computed server-side, already annotated in `newsItem.service.ts`.

The frontend already has the scaffolding this page needs: `apiGet`/`apiGetList` unwrap the envelope (`lib/api/client.ts`), `useTeamId()` resolves the active team, `@tanstack/react-query` v5 is installed and used by `Report.tsx`/`Admin.tsx` (the patterns to copy), and the ui kit has `sheet`, `skeleton`, `card`, `button`, `input`. `/dashboard/feed` is already routed (`routes/user.routes.tsx`) to a placeholder `Feed.tsx` — only the page component changes, not the route.

## Goals / Non-Goals

**Goals:**
- A real, filterable, paginated trend feed reading the actual backend, with correct loading/error/empty states.
- A detail view that degrades cleanly whether or not the item has full `content` (pre/post plan 4).
- A clean generate hand-off (id + title via router state) that plan 8B's Generate page will consume.
- Fix `CLAUDE.md`'s stale frontend map in the same change, since this change is what first populates `components/feed/`.

**Non-Goals:**
- The Generate page itself (8B) — this change only produces the navigation hand-off; the placeholder Generate page may simply not consume the state yet.
- Any backend change — this change is a pure consumer of `GET /news-items`/`GET /news-items/:id` as they exist today.
- A frontend test framework (explicitly out of scope per the parent plan; verification here is `npm run build` + `npm run lint` + manual checklist).
- Mock data — builds against the real dockerized backend; `VITE_USE_MOCK` stays unused.

## Decisions

1. **Explicit sort on every request, always.** Default `-opportunity_score`, with Trending (`-trend_score`) and Newest (`-created_at`) as alternatives. Never rely on the backend's default (`-createdAt`, a no-op given the real field is `created_at`) — if the retention plan later fixes that default, this page's behavior doesn't silently change, because it never depended on it.

2. **Category tabs come from a frontend constant, not `GET /teams/:id/categories`.** `lib/constants.ts` mirrors the backend's fixed `NEWS_CATEGORIES` (`AI`, `Web Dev`, `Career`, `Security`, `DevOps`, `Other`) plus a synthetic "All" tab. The team-categories endpoint returns the *effective* set including team-specific override-only custom labels, which would produce tabs with zero matching items most of the time — the wrong data source for a filter UI. After plan 5A (already applied), the backend already narrows an un-tabbed request by the team's `subscribed_categories` server-side; the tabs remain a further, explicit, within-subscription filter — no coupling needed between the two.

3. **`team_id` is always passed when `useTeamId()` resolves one.** This activates `high_opportunity` annotation and (post-5A) server-side subscription filtering. When no team resolves (e.g. no team memberships yet), the request simply omits it and the feed behaves as the global, unfiltered view — matching `optionalAuth`'s design.

4. **Detail content is fetched on drawer open, not embedded in the list payload.** List responses omit `content` by design (payload weight); the drawer calls `getNewsItem(id)` on open, cached per-id via react-query (`['news-item', id]`). Rendering prefers `content ?? snippet` — this is forward/backward compatible: a pre-plan-4 backend simply never sends `content`, and the drawer falls back to `snippet` with no special-casing needed.

5. **Score meters are simple inline bars, no chart library.** A `w-full` track with a colored fill sized to `value/10 * 100%`, plus the numeric value alongside. Amber for trend score, emerald for opportunity score, matching the existing token contract (`.glass-card`, amber = trending, emerald = opportunity per `CLAUDE.md`). Adding a charting dependency for a single bar is not justified.

6. **Search: local debounce, no new dependency.** A small `useDebouncedValue` hook (`hooks/`) delays the committed search term by 300ms before it enters the react-query key — no debounce library needed for one input. Any filter change (tab, sort, or the debounced search term settling) resets pagination to page 1. Load-more accumulates pages into a single rendered list (manual accumulation in page-local state, keyed by the current filter set so a filter change clears accumulated pages) rather than `useInfiniteQuery`, since react-query v5's infinite-query cache-key semantics add complexity this page doesn't need — a plain paginated query plus local accumulation is simpler and equally correct here.

7. **Four explicit UI states:** skeleton grid (first load per filter set), inline error card with a retry button (react-query `refetch`), and two empty-state variants — "nothing has been ingested yet" (zero items with no active filters) vs. "no matches for these filters" (offers a clear-filters action) — distinguished by whether any tab/search/category filter is currently active.

8. **New component folder, matching what `CLAUDE.md` already (incorrectly) promised.** `components/feed/{ScoreMeter,NewsCard,FeedControls,NewsItemDrawer}.tsx` — this change is what actually creates that folder, and the same change corrects `CLAUDE.md`'s file-structure section to describe the real tree (routes arrays, `components/feed`, `lib/api`, no mock-data promises for these domains) rather than leaving a second stale claim behind.

## Risks / Trade-offs

- **[Manual page-accumulation state could drift from react-query's own cache on rapid filter changes]** → mitigated by resetting accumulated pages whenever the filter-set key changes (tab/sort/debounced-search), not just on mount.
- **[No test framework means these states are only verified manually]** → matches the parent plan's explicit, deliberate scope decision; not something this change introduces or should try to work around.
- **[`high_opportunity`/`is_overridden` depend on a resolved team context]** → when no team resolves, cards simply render without the emerald treatment or override badge — a graceful default, not an error state.

## Migration Plan

- Purely additive on the frontend; no data migration. The only "existing" artifact touched is `CLAUDE.md`'s documentation, which is corrected, not removed — no code depends on its (already-wrong) content.
- Rollback is a plain revert; `/dashboard/feed` reverts to its placeholder with no other page depending on this change's output yet (8B is a separate, later change).

## Open Questions

None — the API contract, states, and component boundaries are fully pinned by the plan's design decisions and grounded against the current backend/frontend code in this session.
