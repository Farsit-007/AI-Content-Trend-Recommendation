## ADDED Requirements

### Requirement: News feed card grid

The dashboard SHALL render news items as a responsive card grid. Each card MUST display the item's title, source name, publication time (relative, e.g. "3h ago"), category label, and a short snippet (max 2 lines). Each card MUST include a "Generate content" action that navigates to the content generator with the item pre-selected.

#### Scenario: Cards are rendered on dashboard load

- **WHEN** a user navigates to `/dashboard`
- **THEN** a grid of news cards is displayed, each showing title, source, time, category, and snippet

#### Scenario: Generate content action

- **WHEN** a user clicks "Generate content" on a news card
- **THEN** they are navigated to the content generator with that news item's context

---

### Requirement: Category tab filtering

The news feed SHALL provide a tab bar with the following categories: All, AI, Web Dev, Career, Security, DevOps, Other. Selecting a tab MUST filter the visible cards to only show items matching that category. The "All" tab MUST show every item regardless of category.

#### Scenario: Default tab is All

- **WHEN** a user loads the dashboard
- **THEN** the "All" tab is active and all news cards are visible

#### Scenario: Category tab filters cards

- **WHEN** a user selects the "AI" tab
- **THEN** only news cards with `category = "AI"` are shown

#### Scenario: Empty category

- **WHEN** a selected category tab has no matching items
- **THEN** an empty state message is shown instead of a grid

---

### Requirement: Sort controls

The news feed SHALL provide a sort control with three options: Trending (by `trend_score` descending), Latest (by `published_at` descending), Relevance (by `relevance_score` descending). The default sort MUST be Trending.

#### Scenario: Default sort is Trending

- **WHEN** a user loads the dashboard
- **THEN** cards are ordered by `trend_score` from highest to lowest

#### Scenario: Sort changes card order

- **WHEN** a user selects "Latest" from the sort control
- **THEN** cards are reordered by `published_at` from newest to oldest

---

### Requirement: Trending badge

Any news card whose `trend_score` is greater than or equal to 7 SHALL display a 🔥 "Trending" badge prominently on the card.

#### Scenario: Badge appears on high-score item

- **WHEN** a news item has `trend_score >= 7`
- **THEN** its card displays a 🔥 Trending badge

#### Scenario: Badge absent on low-score item

- **WHEN** a news item has `trend_score < 7`
- **THEN** its card displays no Trending badge

---

### Requirement: High opportunity badge

Any news card whose `opportunity_score` is greater than or equal to 7 SHALL display a "High opportunity" badge indicating this topic aligns well with the channel's audience data.

#### Scenario: Badge appears on high-opportunity item

- **WHEN** a news item has `opportunity_score >= 7`
- **THEN** its card displays a "High opportunity" badge

#### Scenario: Both badges can coexist

- **WHEN** a news item has both `trend_score >= 7` and `opportunity_score >= 7`
- **THEN** its card displays both the 🔥 Trending badge and the "High opportunity" badge

---

### Requirement: Mock data backing

During the pre-API-wiring phase, the feed SHALL be backed by hardcoded mock data exported from `frontend/lib/mock/news.ts`. The mock data MUST include at least 15 items spanning all 6 categories, with a realistic mix of `trend_score` and `opportunity_score` values, including items that trigger each badge.

#### Scenario: Feed renders without backend

- **WHEN** the dashboard loads with no backend running
- **THEN** the news feed renders with mock data and all interactive features (tabs, sort, badges) work correctly
