# 8 — Frontend Experience: Feed, Generate Editor, Team Settings: OpenSpec Execution Plan

**Problem (V3/V8, and the delivery surface for V2/V6/V7/V10):** "Like a canva for content writers… just click, tweak, copy paste with no extra efforts." Today `Feed.tsx`, `Generate.tsx`, and `Chat.tsx` are literal "Coming soon" placeholders; there is no team switcher, no brand-voice management UI, no team settings UI, and no drafts UI. **Every backend capability in plans 4-7 is invisible until this plan ships.**
**Parent analysis:** [VISION-ALIGNMENT-DEEP-ANALYSIS.md](./VISION-ALIGNMENT-DEEP-ANALYSIS.md) §3.5 (frontend reality), §6 Phase F (design).
**Sibling plans:** consumes 4A/4B (content in detail view), 5A (subscriptions), 6A/6B (style packs), 7A/7B/7C (formats/refine/drafts). **No hard blockers:** 8A works against today's API; 8B degrades gracefully pre-7A/7C (see decisions); 8C's subscription/style sections need 5A/6A.
**Global sequence position:** **8A → 8B → 8C**; Track 3 — can start immediately, in parallel with all backend tracks. Full map in file 4 §Global sequence.
**Date:** 2026-07-17

> **Execution protocol:** `/opsx:propose` → `/opsx:apply` → Verification → `/opsx:archive`, one change at a time.
> Frontend has **no test framework configured** (no vitest/jest in `frontend/package.json`) — verification here is `npm run build` (includes `tsc -b`) + `npm run lint` + the manual checklists. Adding a test framework is deliberately out of scope.

---

## 0. Verified baseline (re-checked 2026-07-17)

| Fact | Location |
|---|---|
| Placeholders: Feed / Generate / Chat render "Coming soon"; Overview is a welcome line | `frontend/src/pages/dashboard/{Feed,Generate,Chat,Overview}.tsx` |
| Routing: role-based path arrays (`userPaths` etc.) generate both routes and sidebar; adding a page = one entry with `name/path/element/icon` | `frontend/src/routes/user.routes.tsx`, `utils/routesGenerator.ts`, `utils/sidebarItemsGenerator.tsx` |
| API client: axios instance with Bearer + single-flight refresh; typed helpers `apiGet`/`apiGetList` (returns `{data, meta}`)/`apiPost`/`apiPatch`/`apiDelete` unwrap the `{success,message,meta,data}` envelope; feature modules are thin functions in `lib/api/*.ts` (see `ingestionRuns.ts`) | `lib/api/client.ts:101-141`, `lib/api/ingestionRuns.ts` |
| `@tanstack/react-query` v5 installed and used (Admin, Report); `sonner` toasts; `lucide-react`; ui kit: button, card, input, label, separator, **sheet**, sidebar, **skeleton**, sonner, tooltip, form | `frontend/package.json`, `components/ui/*` |
| Team context: `useTeamId()` = `VITE_DEFAULT_TEAM_ID` env or `user.team_ids[0]` — **no switcher** | `lib/useTeamId.ts` |
| **Pre-existing backend bug 8C fixes:** `listTeams` returns all teams only for role `'admin'` — a `super_admin` falls into the membership branch and typically gets `[]` | `backend/src/app/modules/Team/team.service.ts:37-42` |
| Backend feed API: `GET /news-items` (optionalAuth) supports `searchTerm`, `category`, `sort`, `page`, `limit`, `team_id`; returns `meta{page,total,limit,totalPage}` + items with `is_overridden`/`high_opportunity`; **default sort is a no-op** (`-createdAt` vs `created_at`) so the UI must always pass an explicit `sort`; after 4A the list omits `content`/`embedding` and `GET /news-items/:id` carries `content` | `newsItem.service.ts:54-99`, `QueryBuilder.ts:57-61`, file 4 §4A |
| Backend zod validations are non-strict objects — unknown body keys (e.g. `formats` sent to a pre-7A backend) are ignored, not rejected | `contentGeneration.validation.ts` (no `.strict()`) |
| Generate API (pre-7A): all-5-format response; (post-7A): requested-formats response; refine/save-draft/regenerate exist only after 7C | files 6-7 |
| Drafts API: `GET /generated-content?team_id=…&status=&source=` (requireAuth) + `PATCH /generated-content/:id {status}` exist **today**; `POST /` arrives with 7C | `generatedContent.route.ts`, `generatedContent.service.ts:21-56` |
| Brand-voice CRUD API complete today: `/brand-voice-examples` list(team-scoped)/create/get/update/delete | `brandVoiceExample.service.ts`, `.route.ts` |
| Team APIs: `GET /teams` (membership-scoped), `GET /teams/:id` → `{team, members}`, `PATCH /teams/:id` (admin), `GET /teams/:id/categories` | `team.service.ts:37-52`, `team.route.ts` |
| Fixed taxonomy for tabs: `['AI','Web Dev','Career','Security','DevOps','Other']` | `newsIngestion.interface.ts:13` |
| Styling contract: Tailwind v4, dark default, `cn()`, tokens `.glass-card`/`.gradient-text`/`.btn-glow`, violet accent / amber trending / emerald opportunity, mobile-first ≥375px | `CLAUDE.md`, `index.css` |
| **`CLAUDE.md`'s frontend file map is stale** (describes `components/feed/`, `lib/mock/` that don't exist; actual tree is `routes/`-based) — fixed in 8A so future agent work follows reality | `CLAUDE.md` vs `frontend/src` tree |

**Non-goals:** Chat page wiring (backend exists; separate small change later — not on the vision's critical path); frontend test framework; SSE/streaming; mock-data layer (build against the real dockerized backend; `VITE_USE_MOCK` stays unused).

---

## Change 8A — `frontend-feed-page`

### Proposal input (for `/opsx:propose`)
> Replace the Feed placeholder with the daily.dev-style trend feed. New `lib/api/news.ts` (typed `NewsItemDto`, `getNewsItems` via `apiGetList` with `searchTerm/category/sort/page/limit/team_id`, `getNewsItem`). Page: sticky controls row — category tabs (All + the six fixed categories), sort select (Opportunity `-opportunity_score` default / Trending `-trend_score` / Newest `-created_at` — always explicit, the backend default sort is a no-op), debounced search — over a responsive card grid. `NewsCard`: title, source badge, relative age, category chip (override-aware), trend + opportunity 0-10 meters, `high_opportunity` emerald treatment, engagement counts, 3-line snippet clamp. Card click opens a detail Sheet: full metadata, "why it matters" impact note, scrollable content preview (full `content` when the item has it, snippet otherwise), source link, and the primary CTA **"✨ Generate content"** navigating to `/dashboard/generate` with `{ newsItemId, topic }` state. Load-more pagination from `meta`, skeleton loading, empty and error states, react-query caching keyed by filter state, 375px-responsive, dark-mode-first. Also updates `CLAUDE.md`'s stale frontend file map to the actual `routes/`-based structure so future work follows reality.

### Design decisions
1. **Explicit sort always** (`-opportunity_score` default) — never rely on the backend's broken default ordering; when the retention plan later fixes defaults, the UI keeps meaning what it says.
2. **Category tabs from the fixed taxonomy constant** (frontend `lib/constants.ts` mirroring the six values + All). Not from `GET /teams/:id/categories` (that list includes override-only custom labels that would produce empty tabs). After 5A, the backend already narrows untabbed requests by subscription — tabs remain a *within-subscription* explicit filter, no UI coupling needed.
3. **`team_id` is always passed** (from `useTeamId()`) when present — it activates `high_opportunity` annotation and (post-5A) subscription filtering server-side.
4. **Detail data via `getNewsItem(id)`** on Sheet open (list payload omits `content` post-4A) — react-query per-id key, cached; pre-4A backends simply return no `content` field and the Sheet falls back to snippet (`content ?? snippet` — forward/backward compatible).
5. **Score meters are tiny inline bars** (`w-full` track + colored fill percentage of /10) with the numeric value — no chart library; amber for trend, emerald for opportunity per the token contract.
6. **Search debounced 300 ms** into the `searchTerm` query key; page resets to 1 on any filter change; "Load more" appends pages (`useInfiniteQuery` or manual page-accumulation — implementer's choice, but scroll position must not jump).
7. **States:** skeleton grid on first load; inline error card with retry (react-query `refetch`); empty state distinguishing "no items at all" from "no matches for filters" (offer clear-filters).
8. **Component layout follows the existing tree** (new `components/feed/{NewsCard,NewsItemDrawer,ScoreMeter,FeedControls}.tsx`) — creating the folder `CLAUDE.md` promised; the same commit rewrites `CLAUDE.md`'s frontend map to match the real `routes/`-based structure (routes arrays, no mock dir).

### Spec delta (capability `frontend-feed`)

## ADDED Requirements

### Requirement: Trend Feed Page
`/dashboard/feed` SHALL list news items from `GET /news-items` with explicit sort (opportunity default, trending, newest), category tabs over the fixed taxonomy, debounced free-text search, and load-more pagination driven by response meta, always passing the active team id when one exists. Each card SHALL show title, source, relative age, category, trend and opportunity scores (0-10 visual + numeric), engagement counts, a clamped snippet, and a distinct high-opportunity treatment. The page SHALL render correct loading, error-with-retry, and empty states, and remain usable at 375 px width in dark mode.

#### Scenario: Default view is ranked by opportunity
- **WHEN** the feed loads with no user interaction
- **THEN** the request carries `sort=-opportunity_score` and cards render in that order

#### Scenario: Filters compose
- **WHEN** the user picks the AI tab and types a search term
- **THEN** one request carries both `category=AI` and the debounced `searchTerm`, and pagination restarts at page 1

#### Scenario: High-opportunity stands out
- **WHEN** an item's `high_opportunity` is true
- **THEN** its card is visibly distinct (emerald treatment) from neighboring cards

### Requirement: News Detail Drawer With Generate CTA
Selecting a card SHALL open a detail drawer fetching the single item, showing full title, source link (new tab), impact note, and a scrollable text preview preferring stored full `content` over the snippet, with a primary "Generate content" action that navigates to the Generate page carrying the item's id and title.

#### Scenario: Click through to generation
- **WHEN** the user opens an item and presses Generate content
- **THEN** the app navigates to `/dashboard/generate` with that item's id and title available to the Generate page

#### Scenario: Content preview degrades to snippet
- **WHEN** the item has no stored `content`
- **THEN** the drawer shows the snippet without layout breakage

### Tasks
1. - [ ] 1.1 `lib/api/news.ts`: `NewsItemDto` (id, source, title, url, snippet?, content?, content_status?, published_at?, engagement{…}, trend_score, opportunity_score?, category?, impact_note?, high_opportunity?, is_overridden?, needs_review?, created_at), `getNewsItems(params)` via `apiGetList`, `getNewsItem(id)`
   - [ ] 1.2 `lib/constants.ts`: `NEWS_CATEGORIES` mirror + sort options map
2. - [ ] 2.1 `components/feed/ScoreMeter.tsx` (label, value/10, color variant)
   - [ ] 2.2 `components/feed/NewsCard.tsx` per §Design (clamp via `line-clamp-3`)
   - [ ] 2.3 `components/feed/FeedControls.tsx` (tabs, sort select, debounced search input)
   - [ ] 2.4 `components/feed/NewsItemDrawer.tsx` on `ui/sheet` per §Design-4, CTA via `useNavigate` state
   - [ ] 2.5 `pages/dashboard/Feed.tsx`: react-query wiring (`['news', filters]` keys), pagination accumulation, states, responsive grid (1/2/3 cols)
3. - [ ] 3.1 Update `CLAUDE.md` frontend section to the real structure (routes arrays, components/feed, lib/api — remove the mock-dir promises or mark them as-built)
4. - [ ] 4.1 `cd frontend && npm run build && npm run lint`

### Verification (manual, against the dockerized backend with real ingested data)
- Feed loads ranked by opportunity; switching tabs/sort/search issues the right requests (network panel) and resets paging; load-more appends without scroll jump.
- An item with full `content` (post-4A) shows the long preview; a snippet-only item degrades cleanly; external link opens the source; Generate CTA lands on `/dashboard/generate` with the topic visible (placeholder page logs/echoes state until 8B).
- 375 px + desktop, dark + light themes, keyboard focus visible on cards; build + lint clean.

---

## Change 8B — `frontend-generate-editor`

### Proposal input (for `/opsx:propose`)
> Replace the Generate placeholder with the Canva-style editor and add a Drafts page. New `lib/api/content.ts` (`generateContent` incl. `formats`/`style_pack_id`/`regenerate`, `refineContent`, `saveDraft`, `listDrafts`, `updateDraftStatus`) and `lib/api/stylePacks.ts` (`listStylePacks`, feature-detecting). Generate page: entry from feed state (context card with the news item) or manual topic input; controls — language segmented control (team default preselected), style-pack select (hidden when the API isn't available yet), format toggles (Facebook + LinkedIn on by default; reel/YouTube/caption on demand); Generate → per-format skeletons → `FormatCard`s: editable auto-growing textarea, live platform-aware char/word counter (FB 150-400 words, LinkedIn 1,200-2,500 chars — amber outside range), **Copy** (clipboard + toast + transient copied state), **Regenerate** (that format only, `regenerate: true`), tweak chips (`ছোট করো`, `আরো casual`, `Stronger hook`, `Add CTA`, free-text) calling refine with single-level Undo, and **Save draft** persisting current editor state; `youtube_idea` renders structured (title/hook/chapters/thumbnail) with copy-as-text. Drafts page (new route + sidebar entry): team drafts with status/source filters, expandable format previews with copy, Approve/Dismiss via the existing PATCH. Endpoints that don't exist yet (refine/save pre-7C, style packs pre-6A) degrade to hidden controls or an informative toast — the page must function against today's backend.

### Design decisions
1. **Render-what-returns:** the results area maps over the response's present format keys — correct against pre-7A (all five) and post-7A (requested subset) backends with zero branching; unknown future keys are ignored.
2. **Graceful capability degradation, feature-detected once per mount:** `listStylePacks()` errors → style select hidden; refine/save returning 404 → toast "This needs the latest backend — coming soon" (client never hard-fails). `formats`/`regenerate` keys sent to a pre-7A backend are harmlessly ignored (non-strict zod verified).
3. **Editor state is client-owned after generation:** response text seeds `useState` per format; user edits are never clobbered except by explicit Regenerate (which replaces that card, with the prior text kept for Undo alongside refine's Undo — a single `previousText` slot per card, one level deep, deliberately simple).
4. **Per-format Regenerate** calls `generateContent({ formats: [id], regenerate: true, …same context })` so sibling cards are untouched (7A's per-format cache makes this cheap).
5. **Refine contract:** chips map to fixed instruction strings (Bangla labels for the two Bangla-flavored ones); free-text tweak input ≤300 chars; response replaces the textarea and arms Undo; instruction input disabled while in flight.
6. **Save draft** posts `{ team_id, news_item_id?, topic, formats: <current editor texts> }` once, on click — no auto-persist churn; success toast links to Drafts.
7. **Counters, not blockers:** out-of-range counts color amber and hint the target; never prevent copying — the human is the editor-in-chief (vision: "tweak, copy paste with no extra efforts").
8. **Language default** from `GET /teams/:id` voice profile (fallback `bangla`); switching language mid-session just changes the next generate call (per-format cache + key handle correctness server-side post-6B).
9. **Drafts page** is a thin list over existing APIs (`listDrafts`, `updateDraftStatus`) — new `pages/dashboard/Drafts.tsx`, `userPaths` entry (icon `FileText`), status chips (draft/approved/dismissed), source badge (auto/manual), expand-in-place previews.

### Spec delta (capability `frontend-generate`)

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

### Requirement: Drafts Page
`/dashboard/drafts` SHALL list the active team's generated content with status and source filters, expandable per-format previews with copy, and Approve/Dismiss actions using the existing status endpoint, reflecting changes without a full reload.

#### Scenario: Approve from the list
- **WHEN** the user approves a draft
- **THEN** the PATCH succeeds and the row shows `approved` immediately

### Tasks
1. - [ ] 1.1 `lib/api/content.ts` + `lib/api/stylePacks.ts` per proposal (typed DTOs; `GeneratedFormats` as partial record)
2. - [ ] 2.1 `components/generate/FormatCard.tsx` (textarea auto-grow, counter logic, Copy/Regenerate/chips/Undo, disabled states)
   - [ ] 2.2 `components/generate/GenerateControls.tsx` (topic/context card, language segmented, pack select, format toggles, Generate button)
   - [ ] 2.3 `components/generate/YoutubeIdeaCard.tsx` (structured render + copy-as-text)
   - [ ] 2.4 `pages/dashboard/Generate.tsx`: location-state intake, feature detection, mutation wiring (react-query `useMutation`), per-card state per §Design-3/4/5, Save draft flow
3. - [ ] 3.1 `pages/dashboard/Drafts.tsx` + `user.routes.tsx` entry per §Design-9
4. - [ ] 4.1 `cd frontend && npm run build && npm run lint`

### Verification (manual)
- Full loop live: feed item → generate (skeletons → two long cards) → edit → copy (paste to verify) → regenerate one card (other untouched, undo works) → "ছোট করো" refine (shorter Bangla, undo works) → save draft → Drafts page shows it → approve.
- Manual-topic entry generates; language switch changes output language on next generate; against a backend without 7C, refine/save degrade to toasts and nothing crashes; 375 px layout; build + lint clean.
- **This change is the vision's demo moment — record a walkthrough once green.**

---

## Change 8C — `frontend-team-settings`

### Proposal input (for `/opsx:propose`)
> The personalization control surface: a Team settings page plus a real team switcher. New `lib/api/teams.ts` + `lib/api/brandVoice.ts`. Page `settings/team` with sections: **Voice profile** (default language select, custom instructions textarea with 500-char counter) → `PATCH /teams/:id`; **Category subscriptions** (checkbox group over the fixed taxonomy; empty = all) — requires plan 5A; **Default style pack** (select from `listStylePacks`) — requires 6A; **Brand voice examples** manager (list/add/delete against the existing CRUD API) with the educational empty state from `RAG-BANGLA-PLAN.md` §1.3b ("Add 25-30 of your real posts — every generation copies your style from these"). Admin-only mutations render read-only (with an explanatory hint) for non-admin members. Team switcher: a `TeamProvider` context persisting the selected team id to localStorage, `useTeamId()` rewired to it (env override → stored selection → first membership), and a Navbar dropdown listing the user's teams — including the **one-line backend fix** letting `super_admin` list all teams (`team.service.ts` role check misses super_admin today).

### Design decisions
1. **Switcher is a context, not a prop drill:** `TeamProvider` wraps the dashboard layout; `useTeamId()` keeps its signature so Feed/Generate/Report/Drafts pick up switching for free; stored id validated against the fetched team list (stale id → fall back to first membership).
2. **The super_admin `listTeams` fix ships here** (backend one-liner: `role === 'admin' || role === 'super_admin'` in `team.service.ts:38`) because the switcher is its consumer; includes a backend test.
3. **RBAC-aware rendering, honest UI:** mutations are admin-gated server-side (`PATCH /teams` etc.) — the UI disables inputs for non-admins with "Ask a team admin to change this" rather than letting a doomed save 403.
4. **Brand-voice add form** fields: content (textarea, required), platform (facebook/linkedin/other), category (optional select over effective categories from `GET /teams/:id/categories`), engagement hint (optional text) — mirroring the API contract; list shows content preview + delete with confirm.
5. **Sections feature-degrade independently** (subscriptions hidden pre-5A via unknown-field detection on the team doc; style pack hidden pre-6A via packs fetch failure) so this change can ship in any order relative to backend tracks.
6. **Sidebar:** settings entries grouped (Platforms, Team) — extend `userPaths` with `settings/team` (icon `Settings2` or `Users`).

### Spec delta (capability `frontend-team-settings`)

## ADDED Requirements

### Requirement: Team Settings Page
`/dashboard/settings/team` SHALL let team admins edit the voice profile (default language, custom instructions ≤500 chars with counter), category subscriptions (fixed-taxonomy checkboxes, empty meaning all), and default style pack, and let them manage brand-voice examples (list, add with content/platform/category/engagement-hint, delete) with an educational empty state; non-admin members SHALL see current values read-only with an explanatory hint. Sections whose backend capability is absent SHALL hide rather than error.

#### Scenario: Voice profile saved
- **WHEN** an admin changes default language to English and saves
- **THEN** the PATCH succeeds and subsequent Generate sessions preselect English

#### Scenario: Brand voice example added
- **WHEN** an admin submits a Bangla post as an example
- **THEN** it appears in the list and the empty-state education disappears

#### Scenario: Non-admin is read-only
- **WHEN** a regular member opens the page
- **THEN** inputs are disabled with a hint and no save controls are actionable

### Requirement: Team Switcher
The dashboard SHALL provide a team switcher listing the user's teams (all teams for admin and super_admin), persisting the selection across reloads, with every team-scoped page (feed, generate, drafts, report, settings) following the switched team. A super_admin SHALL receive the full team list from the backend.

#### Scenario: Switching changes every page
- **WHEN** a member of two teams switches teams
- **THEN** feed, drafts, and settings reflect the newly selected team without relogin

#### Scenario: super_admin sees all teams
- **WHEN** a super_admin opens the switcher
- **THEN** all teams are listed (backend no longer returns an empty membership-scoped list)

### Tasks
1. **Backend one-liner + test**
   - [ ] 1.1 `team.service.ts` `listTeams`: include `super_admin` in the all-teams branch; add integration test case (super_admin lists teams it has no membership in)
2. **API modules**
   - [ ] 2.1 `lib/api/teams.ts` (`listTeams`, `getTeam` → `{team, members}`, `updateTeam`, `getTeamCategories`), `lib/api/brandVoice.ts` (CRUD)
3. **Switcher**
   - [ ] 3.1 `context/TeamProvider.tsx` + rewired `lib/useTeamId.ts` per §Design-1 (env → stored → first membership; stale-id fallback)
   - [ ] 3.2 Navbar team dropdown (name + check on active; hidden when ≤1 team)
4. **Settings page**
   - [ ] 4.1 `pages/dashboard/settings/Team.tsx` with the four sections per §Design (react-hook-form + existing `ui/form` for the profile form; optimistic react-query invalidation on saves)
   - [ ] 4.2 `user.routes.tsx`: add `settings/team`
5. - [ ] 5.1 `cd backend && npm test` (for 1.1) and `cd frontend && npm run build && npm run lint`

### Verification (manual + the one backend test)
- Backend test green; live: super_admin's switcher lists every team.
- Two-team user switches → feed/drafts/settings all follow; selection survives reload.
- Save language + custom instructions → next Generate preselects them; add 2 brand-voice examples → generation output shifts toward them (spot-check); subscriptions checkboxes (post-5A) narrow the feed; non-admin sees read-only.
- **Definition of done for the whole plan:** a brand-new team can be configured (language, subscriptions, examples, pack), browse its personalized feed, and go click → tweak → copy → save entirely through the UI — the vision's end-to-end loop with no API calls by hand.
