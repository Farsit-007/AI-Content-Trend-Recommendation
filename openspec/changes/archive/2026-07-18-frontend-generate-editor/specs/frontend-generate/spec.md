## ADDED Requirements

### Requirement: Generate Editor Page
`/dashboard/generate` SHALL support entry with a news item (id + topic passed from the feed, shown as a context card) or a manually typed topic, offer language (team default preselected), optional style pack (hidden when unavailable), and format selection (Facebook + LinkedIn default), and render each generated format as an editable card with live platform-aware length feedback, one-click copy with confirmation, per-format regenerate, instruction-chip refinement with single-level undo, and draft saving. Backend capabilities that are not yet deployed SHALL degrade to hidden controls or informative toasts, never a broken page.

#### Scenario: Feed-to-copy happy path
- **WHEN** a user arrives from a feed item, generates, edits the Facebook text, and presses Copy
- **THEN** the edited text is on the clipboard and a confirmation toast appears

#### Scenario: Single-format regenerate
- **WHEN** the user regenerates the LinkedIn card
- **THEN** only that card's content is replaced (undo restores the prior text) and other cards are untouched

#### Scenario: Chip refinement
- **WHEN** the user presses "ছোট করো" on a Bangla draft
- **THEN** the card is replaced by a shorter Bangla revision from the refine endpoint, with Undo available

#### Scenario: Manual topic works
- **WHEN** no feed item was passed and the user types a topic
- **THEN** generation proceeds topic-only, matching backend behavior

#### Scenario: Style pack selector hidden when unavailable
- **WHEN** `GET /style-packs` errors or is unreachable
- **THEN** the style-pack selector does not render, and generation proceeds without a `style_pack_id`

#### Scenario: Counter warns without blocking
- **WHEN** a Facebook post's word count falls outside 150-400 words
- **THEN** the counter renders amber but Copy remains enabled

#### Scenario: youtube_idea renders structured
- **WHEN** `youtube_idea` is a requested format
- **THEN** its card shows title, hook, chapters, and thumbnail concept as distinct fields, with a copy-as-text action, and no refine controls

### Requirement: Drafts Page
`/dashboard/drafts` SHALL list the active team's generated content with status and source filters, expandable per-format previews with copy, and Approve/Dismiss actions using the existing status endpoint, reflecting changes without a full reload.

#### Scenario: Approve from the list
- **WHEN** the user approves a draft
- **THEN** the PATCH succeeds and the row shows `approved` immediately

#### Scenario: Filter by status
- **WHEN** the user selects the "approved" status filter
- **THEN** only approved drafts are listed
