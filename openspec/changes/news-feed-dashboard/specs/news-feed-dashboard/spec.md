## ADDED Requirements

---

### Requirement: News feed card grid

The dashboard SHALL render news items as a responsive card grid. Each card MUST display the item's title, source name, publication time (relative, e.g. "3h ago"), category label, and a short snippet (max 2 lines). Each card MUST include a "Generate content" action that navigates to the content generator with the item pre-selected.

#### Scenario: Cards are rendered on dashboard load

- **WHEN** a user navigates to `/dashboard/feed`
- **THEN** a grid of news cards is displayed, each showing title, source, time, category, and snippet

#### Scenario: Generate content action

- **WHEN** a user clicks "Generate content" on a news card
- **THEN** they are navigated to `/dashboard/generate?topic=<encoded title>` with that news item's title pre-filled

---

### Requirement: Category tab filtering

The news feed SHALL provide a tab bar with the following categories: All, AI, Web Dev, Career, Security, DevOps, Other. Selecting a tab MUST filter the visible cards to only show items matching that category. The "All" tab MUST show every item regardless of category.

#### Scenario: Default tab is All

- **WHEN** a user loads the feed
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

- **WHEN** a user loads the feed
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

### Requirement: Mock data backing (feed)

During the pre-API-wiring phase, the feed SHALL be backed by hardcoded mock data exported from `frontend/lib/mock/news.ts`. The mock data MUST include at least 15 items spanning all 6 categories, with a realistic mix of `trend_score` and `opportunity_score` values, including items that trigger each badge.

#### Scenario: Feed renders without backend

- **WHEN** the dashboard loads with no backend running
- **THEN** the news feed renders with mock data and all interactive features (tabs, sort, badges) work correctly

---

### Requirement: Content generator — topic input and generation

The content generator screen SHALL accept a topic (pre-filled from `?topic=` URL param or typed manually) and, on clicking "Generate", SHALL display AI-generated content for all five platform formats. During generation a skeleton loading state MUST be visible.

#### Scenario: Topic pre-filled from feed

- **WHEN** a user clicks "Generate content" on a news card
- **THEN** the generator opens with the card's title already in the topic input

#### Scenario: Generate triggers loading state

- **WHEN** a user clicks "Generate" with a non-empty topic
- **THEN** skeleton placeholders appear for all five format panels while generation runs

#### Scenario: Content appears after generation

- **WHEN** generation completes
- **THEN** all five format panels show their generated text and the skeleton disappears

#### Scenario: Empty topic blocked

- **WHEN** a user clicks "Generate" with an empty topic input
- **THEN** the button is disabled or an inline validation message is shown

---

### Requirement: Content generator — format tabs

The content generator SHALL display five content formats accessible via tabs: FB Post, Reel Script, LinkedIn, YouTube Idea, Caption. An "All" tab SHALL show all five panels stacked vertically.

#### Scenario: All tab is default

- **WHEN** content generation completes
- **THEN** the "All" tab is active and all five format panels are visible

#### Scenario: Individual tab shows one panel

- **WHEN** a user selects the "LinkedIn" tab
- **THEN** only the LinkedIn post panel is visible

---

### Requirement: Content generator — copy to clipboard

Each generated content panel SHALL have a copy button. Clicking it MUST copy that panel's text to the clipboard and show a success toast.

#### Scenario: Copy writes to clipboard

- **WHEN** a user clicks the copy button on a content panel
- **THEN** the panel's text is written to the system clipboard

#### Scenario: Toast confirms copy

- **WHEN** the copy succeeds
- **THEN** a Sonner toast with "Copied!" is shown

---

### Requirement: Content generator — mock data backing

During the pre-API-wiring phase, generated content SHALL come from `frontend/lib/mock/content.ts`. The mock MUST include at least 3 pre-written topic entries covering common demo subjects. For topics not in the mock, a generic fallback entry MUST be used.

---

### Requirement: Report — overview stats

The report screen SHALL display four overview metrics for the last 30 days: Total Reach, Total Engagements, Total Video Views, and Average Engagement Rate. Each metric MUST show its delta (positive or negative percentage) vs the previous 30-day period.

#### Scenario: Metrics are visible on load

- **WHEN** a user navigates to `/dashboard/report`
- **THEN** four stat cards are displayed with values and delta indicators

#### Scenario: Positive delta is green, negative is red

- **WHEN** a metric improved vs the previous period
- **THEN** the delta text is rendered in green (emerald)

---

### Requirement: Report — per-platform sections

The report SHALL include a section for each connected platform (Facebook, YouTube, LinkedIn). Each section MUST show: top 3 posts, best posting time, a 7-day engagement sparkline, and content format breakdown.

#### Scenario: Platform sections are present

- **WHEN** a user views the report
- **THEN** sections for Facebook, YouTube, and LinkedIn are all visible

#### Scenario: Sparkline shows trend shape

- **WHEN** a platform section is expanded
- **THEN** a small inline trend chart visualises 7 days of engagement data

---

### Requirement: Report — AI insight and content opportunities

The report SHALL include an AI-generated cross-platform insight paragraph and a ranked list of the top 5 content opportunities (topic + recommended formats + opportunity score + reason).

#### Scenario: AI insight is present

- **WHEN** a user views the report
- **THEN** an "AI Cross-Platform Insight" block is visible with a Banglish narrative paragraph

#### Scenario: Opportunity list is ranked

- **WHEN** a user views the opportunities section
- **THEN** items are listed 1–5 with opportunity score, topic, and recommended formats

#### Scenario: Opportunity has Generate CTA

- **WHEN** a user clicks "Generate →" on an opportunity item
- **THEN** they are navigated to the content generator with that topic pre-filled

---

### Requirement: Chat — message thread

The chat screen SHALL display a scrollable message thread with user messages right-aligned and assistant messages left-aligned. A typing indicator MUST show while the assistant is preparing a response.

#### Scenario: Greeting on load

- **WHEN** a user navigates to `/dashboard/chat`
- **THEN** an assistant greeting message is already visible in the thread

#### Scenario: User message appears immediately

- **WHEN** a user submits a message
- **THEN** their message appears in the thread right-aligned immediately

#### Scenario: Typing indicator shows during response

- **WHEN** the assistant is preparing a reply
- **THEN** a three-dot typing indicator is visible in the thread

#### Scenario: Assistant response appears after delay

- **WHEN** the mock response delay completes
- **THEN** the typing indicator disappears and the assistant's reply appears

---

### Requirement: Chat — starter prompts

The chat screen SHALL offer three clickable starter prompt chips that pre-fill the input field with a suggested question in Banglish/English.

#### Scenario: Prompt chip fills input

- **WHEN** a user clicks a starter prompt chip
- **THEN** the input field is populated with the prompt text

---

### Requirement: Admin — manual trigger actions

The admin screen SHALL provide two action cards: one for triggering news ingestion (FR-25) and one for triggering analytics refresh (FR-26). Each card MUST show the last-run time, a status badge, and a button. Clicking the button SHALL simulate the action with a 2-second running state followed by a success toast.

#### Scenario: Ingestion trigger shows running state

- **WHEN** a user clicks "Run" on the ingestion card
- **THEN** the button changes to "Running…" with a spinner for 2 seconds

#### Scenario: Success toast on completion

- **WHEN** the simulated action completes
- **THEN** a Sonner toast confirms success and the status badge updates to "Complete"

#### Scenario: Cards are independent

- **WHEN** a user triggers ingestion
- **THEN** the analytics refresh card is unaffected and retains its own state
