## 1. API layer & constants

- [x] 1.1 `frontend/src/lib/api/news.ts`: `NewsItemDto` interface (`_id`, `source`, `title`, `url`, `snippet?`, `content?`, `content_status?`, `published_at?`, `engagement: {points, comments, stars_delta}`, `trend_score`, `opportunity_score?`, `category?`, `impact_note?`, `high_opportunity?`, `is_overridden?`, `needs_review?`, `created_at`); `getNewsItems(params: { searchTerm?; category?; sort: string; page?; limit?; team_id? }): Promise<{ data: NewsItemDto[]; meta?: Meta }>` via `apiGetList('/news-items', { params })`; `getNewsItem(id: string): Promise<NewsItemDto>` via `apiGet`
- [x] 1.2 `frontend/src/lib/constants.ts`: `NEWS_CATEGORIES = ['AI','Web Dev','Career','Security','DevOps','Other']` (mirrors `newsIngestion.interface.ts`); `FEED_SORT_OPTIONS` map (`{ value: '-opportunity_score', label: 'Opportunity' } | { value: '-trend_score', label: 'Trending' } | { value: '-created_at', label: 'Newest' }`), default `-opportunity_score`
- [x] 1.3 `frontend/src/hooks/useDebouncedValue.ts`: small generic debounce hook (300ms), no new dependency

## 2. Components

- [x] 2.1 `components/feed/ScoreMeter.tsx`: label, `value` (0-10), color variant (`amber` | `emerald`) — track + fill bar sized to `value/10`, numeric value alongside
- [x] 2.2 `components/feed/NewsCard.tsx` per §Design: title, source badge, relative age (`Intl.RelativeTimeFormat` or a small local helper), category chip (shows override indicator when `is_overridden`), two `ScoreMeter`s (trend amber, opportunity emerald), `high_opportunity` emerald card treatment, engagement counts (`points`/`comments`/`stars_delta`), snippet clamped via `line-clamp-3`
- [x] 2.3 `components/feed/FeedControls.tsx`: category tabs (All + `NEWS_CATEGORIES`), sort `<select>` over `FEED_SORT_OPTIONS`, search `<input>` wired through `useDebouncedValue`
- [x] 2.4 `components/feed/NewsItemDrawer.tsx`: `ui/sheet`-based drawer, fetches `getNewsItem(id)` on open (`['news-item', id]` query, `enabled: open && !!id`), renders full metadata + impact note + `content ?? snippet` scrollable preview + source link (`target="_blank" rel="noreferrer"`) + "✨ Generate content" button calling `useNavigate()` with `{ state: { newsItemId, topic: title } }` to `/dashboard/generate`
- [x] 2.5 `pages/dashboard/Feed.tsx`: react-query wiring keyed `['news', { category, sort, searchTerm, page }]` (or equivalent filter-state key), page-accumulation state reset on filter-key change, loading/error/empty states per §Design-7, responsive grid (1 col mobile / 2 col tablet / 3 col desktop), wires `NewsItemDrawer` open state to card clicks

  **Implementation note:** used `useInfiniteQuery` instead of manual page-accumulation via `useEffect`+`setState` (design.md called this "implementer's choice"). The manual approach tripped this repo's `react-hooks/set-state-in-effect` lint rule (a hard error, not a warning); `useInfiniteQuery` also naturally resets to page 1 when the filter-key changes (no separate reset effect needed), which is strictly simpler than what was designed.

## 3. Docs

- [x] 3.1 `CLAUDE.md`: rewrite the "Frontend file conventions" tree to the real structure — `routes/` (route + sidebar arrays, `routesGenerator.ts`, `sidebarItemsGenerator.tsx`), `context/` (auth, theme), `components/{feed,landing,layout,report,shared,ui}`, `pages/dashboard/settings/`, `lib/api/*` (no promise of a `news`/`report`/`content`/`chat` mock set — `lib/mock/` today only holds `landing.ts`), `hooks/`, `types/`

## 4. Verification

- [x] 4.1 `cd frontend && npm run build && npm run lint`

  **Note:** `npm run build` is fully clean. `npm run lint` has 2 remaining errors, both pre-existing and unrelated to this change (confirmed via `git status` — neither file was touched this session): `components/ui/sidebar.tsx` (`Math.random()` called inside a `useMemo`, flagged by `react-hooks/purity`) and `hooks/use-mobile.ts` (`setState` called synchronously inside a `useEffect`, flagged by `react-hooks/set-state-in-effect`). I hit the same `set-state-in-effect` rule in my own `Feed.tsx` and switched to `useInfiniteQuery` to satisfy it cleanly (see 2.5) rather than leave a similar violation; these two pre-existing ones are core, actively-used files (the app-wide sidebar and a viewport hook) outside this change's scope, left as-is.
