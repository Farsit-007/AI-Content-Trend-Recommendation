## ADDED Requirements

### Requirement: Trend Feed Page
`/dashboard/feed` SHALL list news items from `GET /news-items` with explicit sort (opportunity default, trending, newest), category tabs over the fixed taxonomy, debounced free-text search, and load-more pagination driven by response meta, always passing the active team id when one exists. Each card SHALL show title, source, relative age, category, trend and opportunity scores (0-10 visual + numeric), engagement counts, a clamped snippet, and a distinct high-opportunity treatment. The page SHALL render correct loading, error-with-retry, and empty states, and remain usable at 375px width in dark mode.

#### Scenario: Default view is ranked by opportunity
- **WHEN** the feed loads with no user interaction
- **THEN** the request carries `sort=-opportunity_score` and cards render in that order

#### Scenario: Filters compose
- **WHEN** the user picks the AI tab and types a search term
- **THEN** one request carries both `category=AI` and the debounced `searchTerm`, and pagination restarts at page 1

#### Scenario: High-opportunity stands out
- **WHEN** an item's `high_opportunity` is true
- **THEN** its card is visibly distinct (emerald treatment) from neighboring cards

#### Scenario: Loading state
- **WHEN** the feed's first page for the current filter set is in flight
- **THEN** a skeleton grid renders in place of cards

#### Scenario: Error state offers retry
- **WHEN** the feed request fails
- **THEN** an inline error card renders with a retry action that re-issues the same request

#### Scenario: Empty states are distinguished
- **WHEN** zero items are returned
- **THEN** the page shows "nothing ingested yet" if no filters are active, or "no matches for these filters" with a clear-filters action if any are

#### Scenario: Load more appends without losing position
- **WHEN** the user clicks Load more
- **THEN** the next page's items are appended to the grid without resetting scroll position

### Requirement: News Detail Drawer With Generate CTA
Selecting a card SHALL open a detail drawer fetching the single item, showing full title, source link (new tab), impact note, and a scrollable text preview preferring stored full `content` over the snippet, with a primary "Generate content" action that navigates to the Generate page carrying the item's id and title.

#### Scenario: Click through to generation
- **WHEN** the user opens an item and presses Generate content
- **THEN** the app navigates to `/dashboard/generate` with that item's id and title available to the Generate page

#### Scenario: Content preview degrades to snippet
- **WHEN** the item has no stored `content`
- **THEN** the drawer shows the snippet without layout breakage
