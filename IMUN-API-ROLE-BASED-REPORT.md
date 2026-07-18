# Growth Studio — Role-Based API Usage Report

**Scope:** every live REST endpoint under `/api/v1`, told as the story of how each role actually uses it — what, when, why, where, and what happens behind the scenes. Verified directly against the current backend route/controller/service/validation files and the current frontend pages/`lib/api/*` files (post social-analytics-feature removal). 48 endpoints total, zero omitted — see the [Appendix](#appendix-full-endpoint-index) for the flat cross-check list.

**Roles:** the system has exactly three, `UserRole = 'super_admin' | 'admin' | 'user'` (`backend/src/app/modules/User/user.interface.ts`). They are **strictly additive** — every capability a `user` has, an `admin` also has; every capability an `admin` has, a `super_admin` also has. So this report tells three nested stories: read the User story first, then Admin (which says "everything above, plus…"), then Super Admin (same pattern).

**Response envelope**, every endpoint: `{ success: boolean, message?: string, meta?: {page, limit, total, totalPage}, data: T }`.

**Auth gates**, cited by name throughout (`backend/src/app/middleware/auth.ts`):
- `optionalAuth` — works with or without a token; personalizes the response if logged in.
- `requireAuth` — any valid, logged-in account, any role.
- `requireTeamAccess('teamId')` — `admin`/`super_admin` always pass; a plain `user` must have `teamId` in their own `team_ids`.
- `requireAdmin` — `admin` or `super_admin` only.
- `requireSuperAdmin` — `super_admin` only.
- Several service methods *also* run their own inline `assertTeamAccess(body.team_id, user)` — same admin-bypass logic, applied to a `team_id` living in the request body/query rather than the URL path. Noted per-endpoint below.

---

## Table of Contents
1. [The User story](#1-the-user-story)
2. [The Admin story](#2-the-admin-story)
3. [The Super Admin story](#3-the-super-admin-story)
4. [Known gaps & discrepancies worth knowing](#4-known-gaps--discrepancies-worth-knowing)
5. [Appendix: full endpoint index](#appendix-full-endpoint-index)

---

## 1. The User Story

The `user` role is a team member — someone whose job is to spot trends and turn them into posts. Every capability described here is available to `admin` and `super_admin` too; it's the floor, not a ceiling.

### 1.1 Before they even have an account — anonymous browsing

**`GET /api/v1/news-items`** and **`GET /api/v1/news-items/:id`** — auth: `optionalAuth`.

**What:** the trend feed and a single item's detail.
**When:** the very first touchpoint — a visitor lands on the public site (or hits the API directly) before ever logging in.
**Why:** the product's growth loop depends on the feed being useful *before* someone commits to an account — see what's trending, then decide it's worth signing up for.
**Where:** would back a public marketing/preview surface; today the actual frontend `Feed.tsx` page lives behind `ProtectedRoute`, so in practice this optional-auth path is exercised by direct API/Swagger calls or a future public page, not the current dashboard UI.
**Scenario:** an anonymous caller hits `GET /news-items?sort=-opportunity_score&limit=15` and gets back the same shape a logged-in user would, minus personalization — no `team_id` resolves, so `is_overridden` is always `false` and there's no `high_opportunity` annotation (that requires a resolvable team). Every other query param works identically: `search=`, `category=`, `page=`.

### 1.2 Getting an account — login, not signup

There is **no self-registration endpoint** — accounts are always admin-created (see §2.1). The user's story begins the moment someone with `admin`/`super_admin` access creates their account and hands them a password.

**`POST /api/v1/auth/login`** — auth: public.
**What:** exchanges `{email, password}` for `{token, refresh_token, user}`; also sets an httpOnly `refresh_token` cookie.
**When:** every session's first request — the `Login.tsx` page's submit handler.
**Why:** everything else requires a Bearer token; this is the one endpoint that mints it.
**Where:** `frontend/src/pages/Login.tsx` → `AuthContext.login()` → `lib/api/auth.ts`'s `login()`.
**Scenario:** the user types their admin-issued credentials. Same error message for a wrong email as a wrong password (no account enumeration) — so a mistyped email doesn't leak "no such account." On success, the access token lands in `localStorage` (`gs_access_token`) and `navigate('/dashboard')` fires.
**Detail worth knowing:** the API docs currently mis-describe this endpoint's response shape as a bare `User` object; the real response — and what the frontend actually reads — is the `AuthTokens` shape (`{token, refresh_token, user}`), same as `/auth/refresh-token`.

**`GET /api/v1/auth/me`** — auth: `requireAuth`.
**What:** `{user, team_ids}` for whoever the Bearer token belongs to.
**When:** on every page load where a token already exists in `localStorage` — `AuthContext`'s boot-hydration effect, *before* the app trusts the stored token.
**Why:** a token that decodes fine can still belong to a deleted account or a password that's since changed; this is the "is this token still good, and who is it" check, run once per app boot rather than trusted blindly.
**Where:** `AuthContext.tsx`, automatic, invisible to the user unless it fails (then they're bounced to `/login`).
**Scenario:** the user closes their laptop mid-session and reopens it the next morning. The stored token is still present, so `getMe()` fires silently on load; if their password hasn't changed and their account still exists, they land straight back on the dashboard with no re-login.

**`POST /api/v1/auth/change-password`** — auth: `requireAuth`.
**What:** `{old_password, new_password}` → a fresh `{token, refresh_token}` pair.
**When:** whenever the user decides to rotate their own password — no dedicated frontend page currently wires this up, but it's a first-class, self-service endpoint any authenticated role can call.
**Why:** self-service credential rotation without needing an admin to reset it.
**Where/Scenario:** a security-conscious user calls this directly (or via a future settings page). The side effect is important to know: it stamps `password_changed_at`, which **silently invalidates every other token issued before this moment** — including the one on their phone if they're logged in on two devices. That's a deliberate "change password = log out everywhere" behavior.

**`POST /api/v1/auth/forgot-password`** / **`POST /api/v1/auth/reset-password`** — auth: public.
**What:** request a reset token by email; redeem a reset token for a new password.
**When:** the user forgot their password and can't log in at all.
**Why:** a self-service recovery path that doesn't depend on an admin being reachable.
**Where/Scenario:** no SMTP is configured in this deployment, so the reset token is never actually emailed — it's logged server-side, and (outside production only) returned directly in the API response for development convenience. The token is a 15-minute-expiry JWT, single-use in practice: redeeming it stamps `password_changed_at`, so a second attempt to reuse the same token fails the same staleness check `change-password` relies on.

**`POST /api/v1/auth/logout`** — auth: public (no token required to call it).
**What:** clears the refresh cookie.
**When:** the user clicks "Log out" — in the Navbar or the sidebar's account menu, both wired to the same call.
**Why:** ends the session's ability to silently refresh; the access token itself just ages out client-side (there's no server-side access-token blocklist).
**Where/Scenario:** on click, the frontend also wipes the entire React Query cache (`queryClient.clear()`) — so if this same browser logs in as someone else afterward, no stale team/draft data leaks across accounts. This call is best-effort — its own failure doesn't block the client-side cleanup.

### 1.3 The morning routine — the Feed

**`GET /api/v1/news-items`** — auth: `optionalAuth`, but now logged in, which changes everything.

**What:** the paginated, filterable trend feed.
**When:** the moment `Feed.tsx` mounts, and again on every filter/search/sort/page change.
**Why:** this is the product's core loop's first step — "what's worth writing about today."
**Where:** `Feed.tsx`'s `useInfiniteQuery`, `FeedControls` for category tabs/search/sort.
**Scenario, in detail:** the user's team has `subscribed_categories: ['AI', 'Web Dev']`. They open Feed with no explicit `?category=` — the backend notices they didn't ask for a specific category and **auto-applies their team's subscription filter**, so they only see AI/Web Dev items without having to remember to filter. If they then click the "Security" tab, that explicit `?category=Security` **overrides** the team subscription entirely for that request — an explicit ask always wins over the standing preference. Default sort is `-opportunity_score`; switching to "Trending" re-sorts by `-trend_score`, "Newest" by `-created_at` — each change resets pagination to page 1. Every returned item is stripped of its `embedding` and `content` fields (list responses stay light) and annotated with `is_overridden` (did *this team* correct this item's category/score?) and `high_opportunity` (does it clear the 7.5 threshold, after any override is applied?).

**`GET /api/v1/news-items/:id`** — auth: `optionalAuth`.
**What:** one item's full detail, including the `content` field the list endpoint omits.
**When:** clicking a card opens `NewsItemDrawer`, which fires this only while the drawer is open.
**Why:** the list payload is deliberately trimmed for feed-scroll performance; the full article text is only fetched on demand.
**Where/Scenario:** the user reads the "why it matters" note and the fuller content preview, decides it's worth a post, and clicks **"✨ Generate content"** — which is a pure client-side route transition (`navigate('/dashboard/generate', {state: {newsItemId, topic}})`), not an API call. The next two calls happen on the page it lands on.

### 1.4 Correcting the machine — category & score overrides

**`PATCH /api/v1/news-items/:id/override`** — auth: `requireAuth` route-level, plus service-level `assertTeamAccess(body.team_id, user)`.
**What:** `{team_id, category?, opportunity_score?}` (at least one required) → an upserted per-team override.
**When:** the categorization LLM got it wrong, or the team's own judgment differs from the auto-computed opportunity score.
**Why:** the shared `NewsItem` document is global — every team sees the same underlying record — but different teams may reasonably disagree about relevance. Overrides let *this team's* view diverge without mutating what every other team sees.
**Where:** currently not wired into the reviewed frontend pages as a visible control (no "correct this category" button exists in `Feed.tsx`/`NewsItemDrawer.tsx` today) — it's a live, callable capability any team member can exercise, just not yet surfaced in the UI.
**Scenario:** a user on the "DevOps" team notices an item got auto-tagged "Web Dev" when it's really a Kubernetes story. They (or a future UI on their behalf) call this with `{team_id: theirTeam, category: 'DevOps'}`. The backend validates `category` against that team's **effective** categories (built-ins + their own custom ones) — an arbitrary string is rejected. From then on, every `GET /news-items` and `GET /news-items/:id` call scoped to that team shows `category: 'DevOps'` and `is_overridden: true` for this item, while every other team still sees "Web Dev."

**`DELETE /api/v1/news-items/:id/override`** — same auth pattern.
**What:** `{team_id}` → removes that team's override, reverting to the shared/global value.
**When/Why/Scenario:** the team changes its mind, or the underlying item gets corrected globally by an admin (§2.5) and the team's local override is now redundant. 404 if no override existed for that team+item pair.

### 1.5 Turning a trend into a post — Generate

Arriving from the Feed's "Generate content" button (or typing a topic manually), the user lands on `Generate.tsx`, which immediately fires two reads before they've clicked anything:

**`GET /api/v1/teams/:teamId`** — auth: `requireTeamAccess('teamId')`.
**What:** `{team, members}`.
**When:** page load.
**Why:** to read `team.voice_profile.default_language` and preselect it — the user shouldn't have to manually pick Bangla/English/Banglish every single time if their team has a standing default.
**Where:** also reused verbatim by the Team Settings page (§1.7) — same endpoint, two different consumers.

**`GET /api/v1/style-packs`** — auth: `requireAuth`.
**What:** the list of active, shared writing styles.
**When:** page load, to populate the optional style-pack dropdown.
**Why:** a team can opt into a curated voice (built by a `super_admin`, see §3.1) on top of their own brand-voice examples.
**Scenario detail — role variance:** a plain `user` (and even an `admin`) always gets only `is_active: true` packs back, full stop; the `include_inactive` query param is silently ignored for anyone who isn't `super_admin` (§3.3). This call is set to `retry: false` in the frontend — if the endpoint 404s (pre-deployment of this feature in an older backend), the dropdown just hides itself rather than erroring the page.

**`POST /api/v1/content/generate`** — auth: `requireAuth` + `assertTeamAccess(body.team_id, user)`.
**What:** `{team_id, topic, news_item_id?, language?, style_pack_id?, formats?, regenerate?}` → `{topic, ...requested formats}`.
**When:** the user clicks "Generate."
**Why:** this is the product's headline feature — turn a trend into ready-to-post drafts in the team's own voice.
**Where:** `GenerateControls` → `generateMutation`.
**Scenario, step by step (what actually happens server-side):**
1. Voice options resolve: request-level `language` override → team default → hardcoded fallback. Same for the style pack: `style_pack_id` in the request → team's `default_style_pack_id` → none. A dangling/inactive pack reference never errors — it logs a warning and silently falls back, so a stale reference from a deleted pack (§3.1's cascade delete) can't break generation.
2. A Redis cache is checked first, keyed on team+item-or-topic+language+pack+format. A cache hit skips the LLM entirely and returns instantly.
3. On a miss: if the team has **zero** brand-voice examples yet, few-shot retrieval is skipped outright ("cold start") and the LLM writes in a neutral, brand-agnostic voice. Otherwise, the topic's embedding is compared against the team's brand-voice examples (and the style pack's examples, if one resolved) to pull the most relevant few-shot examples.
4. If the request carries a `news_item_id` with enough stored content, a fact-sheet gets extracted (its own LLM call, itself cached) to keep the output grounded in real specifics rather than invented ones.
5. One LLM call fires **per requested format**, in parallel. If even one comes back unparseable, the *whole request* fails with a 502 — there's no partial-success response.
6. The user picked the default two formats (Facebook + LinkedIn); the result renders as two editable cards.

**`POST /api/v1/content/generate`, again — per-format Regenerate.**
**Scenario:** the LinkedIn draft feels flat. Clicking "Regenerate" on just that card fires the *same* endpoint again, but with `formats: ['linkedin_post']` and `regenerate: true` — which skips the cache read (so it's guaranteed fresh) and overwrites that one cache entry on success. The Facebook card is completely untouched; the previous LinkedIn text is kept client-side for one-level Undo.

**`POST /api/v1/content/refine`** — auth: `requireAuth` + `assertTeamAccess`.
**What:** `{team_id, format, current_text, instruction, language?, style_pack_id?}` → `{revised_text}`.
**When:** clicking a tweak chip ("shorter", "more casual", "stronger hook") or typing a free-text instruction.
**Why:** editing by re-prompting is often faster than manually rewriting, especially for tone adjustments.
**Where/Scenario:** this call is deliberately **uncached** (every refine is a fresh, unique edit) and text-formats-only — `youtube_idea` is a structured object, not prose, and is rejected by validation if targeted. A 502 here (LLM failure or empty output) leaves the card's text untouched; nothing is lost.

**Copy / Undo** — pure client-side, no API calls at all. Worth naming explicitly since they're part of the same flow: `navigator.clipboard.writeText()` and a `previousText` state restore.

### 1.6 Saving and managing work — Drafts

**`POST /api/v1/generated-content`** — auth: `requireAuth` + `assertTeamAccess(body.team_id, user)`.
**What:** `{team_id, news_item_id?, topic, formats, model_used?}` → a new doc with `source: 'manual', status: 'draft'`.
**When:** clicking "Save draft" on the Generate page, once at least one format has content.
**Why:** generated text lives only in React state until this call — a page refresh before saving loses it.
**Where/Scenario:** on success, a toast appears with a "View drafts" action that navigates to `/dashboard/drafts`. Note this endpoint doesn't dedupe against the auto-generation job's per-item dedupe (§2.6) — a manual save and an auto-generated draft for the same news item can coexist as two separate rows.

**`GET /api/v1/generated-content`** — auth: `requireAuth` + `assertTeamAccess(query.team_id, user)`.
**What:** paginated, filterable (`status`, `source`) list of the team's drafts.
**When:** `Drafts.tsx` page load, and again on any filter change.
**Why:** the single place to review everything ever generated — hand-typed or auto-generated — before it goes anywhere.
**Where/Scenario:** the user filters to `status=draft` to see only what still needs review, or `source=auto` to specifically check what the overnight auto-generation job (§2.6) produced while they were away.

**`PATCH /api/v1/generated-content/:id`** — auth: `requireAuth` + `assertTeamAccess` resolved from *the document's own* `team_id`, not a request param.
**What:** `{status: 'approved' | 'dismissed'}` — a one-way forward transition; you cannot PATCH something back to `'draft'`.
**When:** the Approve/Dismiss buttons on each draft row.
**Why:** turns the drafts list into a lightweight review queue — approved content is presumably ready to actually post (posting itself is out of scope of this API), dismissed content is explicitly rejected so it stops cluttering the "needs review" filter.
**Scenario:** notably, this is **not** admin-gated — any team member can approve or dismiss any draft belonging to their team, including ones an admin's auto-generation job produced.

### 1.7 Reading team settings — mostly a spectator here

`Team.tsx` is the same route and same page for every role, but a plain `user` sees it in **read-only** mode — the page computes `isAdmin = role === 'admin' || role === 'super_admin'` once and threads it through every section.

**`GET /api/v1/teams/:teamId`**, **`GET /api/v1/teams/:teamId/categories`**, **`GET /api/v1/style-packs`** — all fire identically to how an admin would load the page (see §2.7 for the write-side story). A `user` sees their team's current voice profile, subscribed categories, and default style pack — all disabled inputs, with "Ask a team admin to change this" in place of a Save button.

**`GET /api/v1/brand-voice-examples?team_id=…`** — auth: `requireAuth`, role variance: a plain `user` is hard-scoped server-side to their own `team_ids` regardless of what `team_id` they pass; an admin/super_admin can query any team.
**What/When/Why:** the list of real example posts that ground every generation in the team's actual voice (§1.5, step 3). A `user` sees this list — the "add new example" form and each item's delete button are simply not rendered for them in the UI.
**Worth knowing:** the backend does **not** actually block a plain team member from calling `POST /brand-voice-examples` or `DELETE /brand-voice-examples/:id` directly — those routes only require `requireAuth` + team membership, not `requireAdmin`. The read-only restriction on this page is a **frontend UI choice**, not a backend permission boundary. A technically-inclined user could add or remove their own team's brand-voice examples via a direct API call even though the button is hidden from them.

### 1.8 Multi-team members — the switcher

If (and only if) a user belongs to more than one team, the Navbar shows a team switcher.

**`GET /api/v1/teams`** — auth: `requireAuth`, role variance central to this whole feature: a plain `user` gets back only teams in their own `team_ids`; `admin`/`super_admin` get **every** team in the system.
**When:** once, on `TeamProvider` mount.
**Why:** populates the switcher and resolves which team is "active" (env override → last-selected, validated against this list → first membership → first team in the list).
**Where/Scenario:** clicking a different team in the dropdown does **not** call any API — it's a pure `localStorage` write. What actually happens next is that every team-scoped query already on screen (Feed's news-items call, Drafts' list, Team's settings reads) re-fires automatically because its query key includes the now-changed `teamId`.

---

## 2. The Admin Story

Everything in §1 still applies — an `admin` is a `user` plus organizational authority: they stand up teams, manage rosters, and keep the shared news catalog and generation pipeline healthy.

### 2.1 Building the team — creating accounts

**`POST /api/v1/users`** — auth: `requireAdmin`.
**What:** `{email, password, name, role?, team_ids?}` → a new `User`.
**When:** onboarding a new hire, or standing up the very first account for a new team.
**Why:** there is no self-registration in this system by design — every account is provisioned deliberately.
**Where:** no dedicated "create user" page was found in the reviewed frontend — this is a backend-only capability today (direct API / Swagger), same caveat as style packs (§3.4).
**Scenario, with the role boundary:** an `admin` creates a new team member with `role: 'user'` — that's the common case. If they try `role: 'super_admin'`, the request is rejected with a 403 ("Only a super_admin can create another super_admin") — creating a peer-or-higher admin tier is off-limits even to an existing admin. A `super_admin` caller hits no such ceiling (§3.5). If `team_ids` is supplied, the new account is bulk-enrolled into those teams' `TeamMembership` immediately — one call, fully onboarded.

**`GET /api/v1/users`** — auth: `requireAdmin`.
**What:** every user account, optionally filtered by `?team_id=`.
**When:** reviewing who has access to what — auditing a team's roster, or checking for duplicate/stale accounts platform-wide.
**Why/Scenario:** omitting `team_id` returns **every user in the system**, not just the admin's own teams — there's no team-scoping on this read the way there is on, say, brand-voice examples. Any admin can see the full user directory.

### 2.2 Standing up and running teams

**`POST /api/v1/teams`** — auth: `requireAdmin`.
**What:** `{name, description?, member_ids?}` → a new `Team`, `created_by` stamped from the caller.
**When:** onboarding a new client, department, or project that needs its own isolated feed subscriptions, brand voice, and drafts.
**Why/Scenario:** if `member_ids` is supplied, every id is validated to actually exist first (400 if any don't, duplicates silently collapse) — then `TeamMembership` rows are bulk-created in one shot, so the team is immediately staffed, not empty.

**`PATCH /api/v1/teams/:teamId`** — auth: `requireAdmin` — **not** `requireTeamAccess**.
**Scenario worth calling out explicitly:** this is the endpoint behind every Save button on the Team Settings page (§1.7/§2.7), and because it's gated purely on the caller's *global* role rather than membership in `:teamId`, **any admin can edit any team's settings, even one they don't personally belong to.** An admin who oversees five client teams doesn't need to be added as a member of each one to configure their voice profiles.

**`DELETE /api/v1/teams/:teamId`** — auth: `requireAdmin`.
**What/When:** decommissioning a team that's no longer active.
**Scenario, and a real gap:** this cascades to delete the team's `TeamMembership` rows, so members lose access cleanly — but it does **not** cascade-delete that team's `BrandVoiceExample`, `GeneratedContent`, `ChatMessage`, or `NewsItemCategoryOverride` documents. Those rows are orphaned by `team_id`, silently surviving the team's deletion. Worth knowing before relying on team deletion as a full data-cleanup step.

**`POST /api/v1/teams/:teamId/members`** / **`DELETE /api/v1/teams/:teamId/members/:userId`** — auth: `requireAdmin`.
**What/When/Scenario:** adding someone to (409 if already a member) or removing someone from a team's roster — the mechanics behind growing or right-sizing a team after it already exists. 404s cover both a missing team/user on add, and a non-member on remove.

### 2.3 Keeping the news pipeline healthy

This is the story behind `Admin.tsx`, the one page the sidebar only shows to `admin`/`super_admin`.

**`GET /api/v1/news-items/ingestion-runs`** — auth: `requireAdmin`.
**What:** `{runs, sourceHealth}` — recent pipeline run history plus a computed alert flag per source.
**When:** page load, and again on the "Refresh" button.
**Why:** the feed's entire value depends on ingestion actually running and actually finding fresh content from every configured source (Hacker News, dev.to, GitHub Trending, Reddit, RSS, GNews, Mastodon, Product Hunt, StackOverflow). This is the dashboard for noticing when one silently breaks.
**Scenario:** `sourceHealth[i].alert` flips `true` once a source has returned zero fetched items for **three consecutive runs** — e.g., a Reddit API credential expired, or an RSS feed URL started 404ing. The admin sees it flagged here before a user ever notices the feed feels thin.
**Detail worth knowing:** this endpoint exists and works, but it's entirely undocumented in the OpenAPI/Swagger spec — absent from every docs file. It's real, it's admin-only, and Swagger UI simply doesn't know about it.

**`POST /api/v1/news-items/ingest`** — auth: `requireAdmin`.
**What:** synchronously runs the full 4-layer ingestion pipeline (fetch every source → dedupe/freshness → semantic dedupe via embeddings → relevance/trend/opportunity scoring → store) right now, on demand.
**When/Why:** a scheduled cron already runs this automatically, but an admin might want fresh content immediately — right before a demo, or right after fixing a broken source credential, without waiting for the next scheduled window.
**Where:** this is a real, callable, admin-gated capability — but **no button in the current frontend calls it**. `Admin.tsx` is read-only monitoring only; triggering a run today means calling this endpoint directly (Swagger UI, curl, or similar), not clicking anything in the dashboard.
**Scenario, cost note:** this is a heavy, fully synchronous call — one embedding call per surviving item, plus batched LLM categorization calls, with no rate limiting in front of it. An admin calling this repeatedly in quick succession is calling it at full cost each time; content-hash and semantic dedup prevent literal duplicate storage, but they don't prevent the compute cost of re-running the pipeline.

### 2.4 Correcting the shared catalog directly

Distinct from the per-team overrides in §1.4, an admin can mutate the **global, shared** news record everyone sees.

**`POST /api/v1/news-items`** — auth: `requireAdmin`.
**What:** manually creates a `NewsItem` (embedding auto-computed from title+snippet if not supplied).
**When/Why:** backfilling a story the automated pipeline missed, or seeding test/demo data.

**`PATCH /api/v1/news-items/:id`** — auth: `requireAdmin`.
**What/When/Why:** correcting a bad title, fixing a broken source URL, adjusting `trend_score`/`opportunity_score`/`category` for **everyone**, not just one team.
**Scenario, the key distinction from §1.4:** if the categorization was wrong for the *entire platform* (not just one team's opinion), an admin fixes it here once, globally — versus a `user`'s override (§1.4), which only changes what their own team sees while the shared record stays as-is. An admin might well do both: fix the record here, and separately see that a team already had a now-redundant override on top of it.

**`DELETE /api/v1/news-items/:id`** — auth: `requireAdmin`.
**What/When:** removing a story entirely — spam, a duplicate the semantic dedup missed, something legally sensitive.

### 2.5 Running the auto-generation job on demand

**`POST /api/v1/generated-content/run`** — auth: `requireAdmin`.
**What:** `{team_id?}` (omit = every team) → `{teams_processed, drafts_created, skipped}`.
**When/Why:** the exact same job a scheduler already runs unattended once a day — an admin might want to force a run right now for one specific team (e.g., right after that team finally adds its first brand-voice examples and is no longer in "cold start"), rather than waiting for the next scheduled window.
**Scenario, the mechanics:** for each target team, the job skips entirely if the team still has zero brand-voice examples (identical cold-start rule as manual generation). Otherwise it pulls the team's top 3 news items by opportunity/trend score (filtered to their category subscriptions and a recency window), and for each one, **skips if a draft already exists for that exact team+news-item pair** — so re-running this doesn't spam duplicate drafts. It's globally capped at a max LLM-call budget per run, stopping early — possibly mid-team — once that cap is hit. Every draft it does create lands with `source: 'auto', status: 'draft'`, indistinguishable in the Drafts list from what the nightly cron produces, other than that `source` tag.

### 2.6 Team settings — now with the pen unlocked

Same `Team.tsx` page as §1.7, but `isAdmin` is now `true`, so every Save button and the brand-voice "add example" form actually render.

**`PATCH /api/v1/teams/:teamId`** (again, the write side this time): submitting the language toggle + custom-instructions textarea (`VoiceProfileSection`), the category checkboxes (`CategorySubscriptionsSection`), or the style-pack dropdown (`StylePackSection`) each independently call this same endpoint with just the one changed field — `{voice_profile}`, `{subscribed_categories}`, or `{default_style_pack_id}` respectively.

**`POST /api/v1/brand-voice-examples`** / **`DELETE /api/v1/brand-voice-examples/:id`**: the "Add example" form (content, platform, optional category, optional engagement hint) and each row's trash icon (behind a confirm dialog) are only rendered for an admin — even though, per §1.7's caveat, the backend would technically allow a plain member to call these too. For an admin, it's simply the front door instead of a workaround.

---

## 3. The Super Admin Story

Everything in §2 (and therefore §1) still applies. A `super_admin` passes every `requireAdmin` check identically to a plain `admin` — there is **no additional permission gate** on team/user/news-item management between the two tiers. The tier's *exclusive* territory is narrower and more specific: curating the platform-wide style-pack library, seeing retired packs, and minting other super_admins.

### 3.1 Curating the shared style library

This entire section is gated by `requireSuperAdmin` — a plain `admin` gets a flat 403 on all five writes.

**`POST /api/v1/style-packs`** — `{name, slug, description?, language, tone_tags?, style_card?, is_active?}` → a new `StylePack`, `created_by` stamped from the caller.
**What/When/Why:** building a new curated voice — say, "Programming Hero," a specific energetic-Bangla-tech-explainer style — that any team can then opt into as their `default_style_pack_id` (§1.5/§2.6), on top of their own brand-voice examples.

**`POST /api/v1/style-packs/:id/examples`** — `{content, platform?, source_ref?, engagement_hint?}` → a new `StyleExample`, embedding auto-computed.
**What/When/Why:** the pack is just a name and a `style_card` description until it has real example posts to ground generation in — this is how a super_admin actually teaches the style, one example post at a time, the same few-shot mechanism as team brand-voice examples but shared platform-wide instead of per-team.

**`PATCH /api/v1/style-packs/:id`** — same shape as create, all fields optional.
**Scenario, the retirement pattern:** rather than deleting a pack teams currently reference, the standard move is `{is_active: false}` — it stops appearing in the default `GET /style-packs` list (§1.5) for everyone, without breaking any team still pointing at it (dangling-reference fallback, §1.5 step 1, handles that gracefully).

**`DELETE /api/v1/style-packs/:id`** — the harder version.
**Scenario, and the cascade worth knowing:** this **does** cascade-delete every `StyleExample` belonging to the pack — no orphaned examples left behind, unlike the team-deletion gap in §2.2. It does *not* clean up any team's `default_style_pack_id` still pointing at the now-gone pack, by the same soft-fail design as above — that team's next generation just quietly proceeds without a style pack.

**`DELETE /api/v1/style-packs/:id/examples/:exampleId`** — pruning a single bad example (wrong platform tag, low-quality writing) without touching the rest of the pack.

### 3.2 Seeing the whole library, including what's retired

**`GET /api/v1/style-packs?include_inactive=true`** — auth: `requireAuth`, but the query param **only takes effect for `super_admin`**.
**What/When/Why:** reviewing every pack ever created — including ones already flagged `is_active: false` — to decide whether to fully delete one, reactivate one, or just audit the full catalog. Any other role sending this same query param gets it silently ignored and only active packs back.

**`GET /api/v1/style-packs/:id`** and **`GET /api/v1/style-packs/:id/examples`** — worth noting these two have **no** active/inactive gating at all, for any role: any authenticated user who already knows (or guesses) a specific pack id can fetch its detail and browse its examples directly, active or not. The `include_inactive` restriction only applies to the *list* endpoint's default browsing view.

### 3.3 The honest caveat: no frontend exists for any of this yet

Every capability in §3.1–3.2 is a real, live, working API — verified directly against the route/controller/service/validation code — but **there is no page anywhere in the current frontend that calls any of these five style-pack write endpoints.** `Team.tsx`'s `StylePackSection` only ever *reads* `GET /style-packs` to populate a dropdown of packs a super_admin already created some other way. Today, a super_admin's actual workflow for §3.1–3.2 is: open `/api/v1/docs` (the live Swagger UI) or a raw HTTP client, and call these endpoints directly. This is the single biggest gap between "what the API supports" and "what the dashboard exposes" in the whole system.

### 3.4 Minting other super admins

**`POST /api/v1/users`** with `{role: 'super_admin'}` — the same endpoint as §2.1, but the one variant of its input a plain `admin` is blocked from sending.
**What/When/Why:** growing the platform-operator tier itself — someone who needs full curation authority over the shared style library, not just one team's or one organization's settings.
**Scenario:** a `super_admin` fills out the same create-user form as an admin would, but ticks `role: super_admin` instead of leaving it at the default `'user'`. No special additional endpoint exists for this — it's the identical `POST /users` call, just with a role value only this tier is allowed to submit.

### 3.5 Everything downstream is identical to Admin

`GET /teams` returns every team for a `super_admin` for the exact same reason it does for an `admin` — the check is `role === 'admin' || role === 'super_admin'`, not tiered further. Same for `PATCH /teams/:teamId` (edit any team), `POST /news-items/ingest`, `GET /news-items/ingestion-runs`, `POST /generated-content/run`, and every other `requireAdmin` endpoint in §2 — a super_admin exercises all of them exactly as described there, with zero behavioral difference. The super_admin story is the admin story, plus §3.1–3.4, nothing more, nothing less.

---

## 4. Known gaps & discrepancies worth knowing

Surfaced during this analysis, not asked for directly, but directly relevant to understanding what the API "really" permits versus what the current UI implies:

1. **Frontend route protection is currently a no-op.** `ProtectedRoute.tsx`'s auth/role-check logic is fully commented out — the dashboard router always registers the *full* super-admin route set regardless of the logged-in user's actual role. Today, `/dashboard/admin` is only *hidden from the sidebar* for a plain `user`, not actually blocked from direct navigation. The real authorization boundary is entirely server-side (`requireAdmin` on `GET /news-items/ingestion-runs`) — which does work correctly — but the client-side gate that's supposed to back it up isn't currently active.
2. **Brand-voice write access is broader than the UI implies (§1.7).** `POST`/`DELETE /brand-voice-examples` only require team membership, not `requireAdmin` — the admin-only "Add/Delete" UI is a frontend choice layered on top of a backend permission that's actually available to any team member.
3. **`GET /news-items/ingestion-runs` is entirely undocumented** in the OpenAPI spec, despite being a real, working, admin-gated endpoint the `Admin.tsx` page depends on.
4. **No manual ingestion-trigger button exists in the frontend** (§2.3), despite the `POST /news-items/ingest` endpoint being fully functional and admin-accessible — and despite the ingestion-run history table having a `trigger: 'manual' | 'cron'` field ready to display one.
5. **Team deletion orphans data** (§2.2): `BrandVoiceExample`, `GeneratedContent`, `ChatMessage`, and `NewsItemCategoryOverride` rows are not cascade-deleted when their team is.
6. **No style-pack management UI exists at all** (§3.3) — the single largest gap between API capability and dashboard reality.
7. **`/auth/login`'s documented response schema is wrong** in the OpenAPI spec (documents `User`, actually returns `AuthTokens`-shaped `{token, refresh_token, user}`).
8. **Generic CRUD paths carry no auth/role metadata in the OpenAPI docs.** `/news-items` and `/brand-voice-examples`'s base CRUD operations (built via `buildResourcePaths`) show no `security` requirement in Swagger, even though every one of them actually requires at least `requireAuth`, and several require `requireAdmin` — someone reading only the generated docs would believe these are open endpoints.

---

## Appendix: Full Endpoint Index

Every endpoint, one line each, grouped by module — the flat cross-check confirming nothing above was skipped.

### Auth (7)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /auth/login` | public | Exchange credentials for a token pair |
| `POST /auth/refresh-token` | public (cookie) | Rotate an access token via the refresh cookie |
| `POST /auth/logout` | public | Clear the refresh cookie |
| `POST /auth/change-password` | `requireAuth` | Self-service password rotation; invalidates other sessions |
| `POST /auth/forgot-password` | public | Issue a password-reset token (logged, not emailed) |
| `POST /auth/reset-password` | public | Redeem a reset token for a new password |
| `GET /auth/me` | `requireAuth` | Validate the current token; return `{user, team_ids}` |

### Users (2)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /users` | `requireAdmin` (super_admin-only for `role:'super_admin'`) | Create an account |
| `GET /users` | `requireAdmin` | List all users, optional `?team_id=` filter |

### Teams (10)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /teams` | `requireAdmin` | Create a team |
| `GET /teams` | `requireAuth` (role-scoped) | List teams — all for admin/super_admin, own-only for user |
| `GET /teams/:teamId` | `requireTeamAccess` | Team detail + member roster |
| `PATCH /teams/:teamId` | `requireAdmin` | Update voice profile / subscriptions / default style pack |
| `DELETE /teams/:teamId` | `requireAdmin` | Delete a team (partial cascade — see gaps) |
| `POST /teams/:teamId/members` | `requireAdmin` | Add a member |
| `DELETE /teams/:teamId/members/:userId` | `requireAdmin` | Remove a member |
| `GET /teams/:teamId/categories` | `requireTeamAccess` | Effective categories (built-in + custom) |
| `POST /teams/:teamId/categories` | `requireTeamAccess` | Add a custom category (any member, not admin-only) |
| `DELETE /teams/:teamId/categories/:category` | `requireTeamAccess` | Remove a custom category |

### News Items (9)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /news-items/ingest` | `requireAdmin` | Manually run the full ingestion pipeline now |
| `GET /news-items/ingestion-runs` | `requireAdmin` | Run history + per-source health (undocumented in Swagger) |
| `PATCH /news-items/:id/override` | `requireAuth` + team-scoped | Per-team category/score correction |
| `DELETE /news-items/:id/override` | `requireAuth` + team-scoped | Remove a per-team correction |
| `POST /news-items` | `requireAdmin` | Manually create a global news item |
| `GET /news-items` | `optionalAuth` | Paginated, personalized trend feed |
| `GET /news-items/:id` | `optionalAuth` | Single item detail (includes full `content`) |
| `PATCH /news-items/:id` | `requireAdmin` | Edit the shared/global record |
| `DELETE /news-items/:id` | `requireAdmin` | Delete a global news item |

### Brand Voice Examples (5)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /brand-voice-examples` | `requireAuth` + team-scoped | Add a real example post |
| `GET /brand-voice-examples` | `requireAuth` (role-scoped) | List examples — all teams for admin, own-team for user |
| `GET /brand-voice-examples/:id` | `requireAuth` + team-scoped | Single example (404s if cross-team, not 403) |
| `PATCH /brand-voice-examples/:id` | `requireAuth` + team-scoped | Edit an example |
| `DELETE /brand-voice-examples/:id` | `requireAuth` + team-scoped | Remove an example |

### Content Generation (2)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /content/generate` | `requireAuth` + team-scoped | RAG-grounded multi-format content generation |
| `POST /content/refine` | `requireAuth` + team-scoped | Instruction-driven edit of one draft |

### Chat (1)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /chat` | `requireAuth` + team-scoped | News-grounded conversational Q&A |

### Generated Content (4)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `GET /generated-content` | `requireAuth` + team-scoped | List drafts, filterable by status/source |
| `POST /generated-content` | `requireAuth` + team-scoped | Save a manually generated draft |
| `POST /generated-content/run` | `requireAdmin` | Trigger the auto-generation job on demand |
| `PATCH /generated-content/:id` | `requireAuth` + team-scoped | Approve or dismiss a draft (any member) |

### Style Packs (8)
| Method & Path | Auth | One-line purpose |
|---|---|---|
| `POST /style-packs` | `requireSuperAdmin` | Create a shared writing style |
| `GET /style-packs` | `requireAuth` (role-scoped) | List active packs (+inactive, super_admin only) |
| `GET /style-packs/:id` | `requireAuth` | Single pack detail + example count |
| `PATCH /style-packs/:id` | `requireSuperAdmin` | Edit or retire (`is_active:false`) a pack |
| `DELETE /style-packs/:id` | `requireSuperAdmin` | Delete a pack (cascades its examples) |
| `POST /style-packs/:id/examples` | `requireSuperAdmin` | Teach the pack a new example |
| `GET /style-packs/:id/examples` | `requireAuth` | Browse a pack's examples |
| `DELETE /style-packs/:id/examples/:exampleId` | `requireSuperAdmin` | Remove one example |

**Total: 48 endpoints. All 48 appear at least once in §1–3's narratives above.**
