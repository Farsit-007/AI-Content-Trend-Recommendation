## Context

The backend contract this change consumes, all already applied:

- `POST /content/generate` — `{ team_id, topic, news_item_id?, language?, style_pack_id?, formats?, regenerate? }` → `{ topic, ...requestedFormats }`, where each text-kind format (`facebook_post`, `linkedin_post`, `facebook_reel_script`, `caption`) is a plain string and `youtube_idea` is `{ title, hook, chapters: string[], thumbnail_concept }`. `formats` defaults server-side to `['facebook_post', 'linkedin_post']` when omitted. `regenerate: true` bypasses cache for the requested formats and overwrites them.
- `POST /content/refine` — `{ team_id, format (text formats only), current_text, instruction, language?, style_pack_id? }` → `{ revised_text }`. One uncached call; `youtube_idea` is rejected at validation.
- `POST /generated-content` — `{ team_id, news_item_id?, topic, formats (partial, ≥1), model_used? }` → the created `source: 'manual', status: 'draft'` document.
- `GET /generated-content?team_id&status?&source?&page?&limit?` → paginated drafts; `PATCH /generated-content/:id { status }` → updated draft.
- `GET /style-packs` → all active packs (any authenticated user; `super_admin`/admin can pass `include_inactive`), no pagination envelope — a plain array in `data`.

8A already shipped `NewsItemDrawer`'s Generate CTA, navigating to `/dashboard/generate` with `{ state: { newsItemId, topic } }` — this change is the first thing to read that state. The frontend's existing patterns to build on: `apiGet`/`apiGetList`/`apiPost`/`apiPatch` (envelope-unwrapping), `useTeamId()`, `@tanstack/react-query` (`useQuery`/`useMutation`), `sonner`'s `toast.success`/`toast.error` (already used in `Platforms.tsx`), and the `glass-card`/`btn-glow` token contract used throughout the dashboard.

## Goals / Non-Goals

**Goals:**
- A working click → generate → tweak → copy → save loop against today's real backend.
- Defensive feature-detection so the page never hard-crashes if a capability is missing (even though, today, none are).
- A thin Drafts page over the existing list/update-status endpoints.

**Non-Goals:**
- Any backend change.
- Streaming/SSE, multi-level undo history, or auto-persisting drafts on every keystroke.
- `youtube_idea` refinement (backend already excludes it from `/content/refine`; the UI simply never offers refine controls on that card).
- A frontend test framework (parent plan's explicit, standing scope decision).

## Decisions

1. **Render-what-returns.** The results area maps over the response object's present format keys (excluding `topic`) rather than assuming a fixed five — correct today's requested-subset backend with zero branching, and would remain correct against a hypothetical older all-five backend too, since it's just "render whatever keys are there."

2. **Feature detection, once per mount, not per action.** `listStylePacks()` is fetched with `useQuery({ retry: false })`; on error, the style-pack `<select>` is simply omitted from `GenerateControls` (not shown as a disabled/broken control). Refine and save-draft aren't pre-checked — they're called on demand, and a failure (network error, or a 404 if a hypothetically older backend lacks the route) is caught by the mutation's `onError` and shown as `toast.error(...)`, never an unhandled crash. `formats`/`regenerate` are just extra JSON keys — the backend's zod validation is non-strict, so sending them to any backend that doesn't recognize a key is harmless.

3. **Editor state is client-owned after the initial generate.** Each format's textarea seeds a local `useState<string>` from the response; user edits are never overwritten except by an explicit action (Regenerate or a chip/refine). A single `previousText` slot per card holds the pre-action text for one level of Undo — Regenerate and Refine both populate it before replacing the card's text, and Undo restores it and clears the slot. This is deliberately not a full history stack.

4. **Regenerate is per-card, scoped by construction.** The button calls `generateContent({ team_id, topic, news_item_id?, language, style_pack_id?, formats: [thisFormatOnly], regenerate: true })` — the same context as the original generation, but a single-format array. Because the backend's cache and cache-writes are per-format (already shipped), this is cheap and never touches sibling cards' cached results.

5. **Refine contract:** four fixed chips plus a free-text input (≤300 chars, matching the backend's bound). Chip → instruction mapping:
   - "ছোট করো" → "Make it noticeably shorter."
   - "আরো casual" → "Make the tone more casual and conversational."
   - "Stronger hook" → "Rewrite the opening line to be a stronger, more attention-grabbing hook."
   - "Add CTA" → "Add a clear call-to-action at the end."
   The chip *label* is what a Bangla-writing team recognizes; the *instruction string* sent to the backend is plain English — the refine endpoint's system prompt already handles language preservation independently of what language the instruction itself is written in, so this is a UI/copy choice, not a backend requirement. While a refine call for a card is in flight, that card's instruction input and chips are disabled (not the whole page).

6. **Save draft is an explicit, single action.** On click, `POST /generated-content` fires once with `{ team_id, news_item_id?, topic, formats: <current editor texts for every card that has content> }` — no auto-persist during iteration. Success shows a toast with a link to `/dashboard/drafts`; failure shows `toast.error`.

7. **Counters inform, never block.** Each text card shows a live count against its format's target (Facebook 150-400 words, LinkedIn 1,200-2,500 characters — the same thresholds `contentGeneration.formats.ts` prompts for) — inside the range is neutral/muted text, outside is amber. Copy is always available regardless of count; the human stays editor-in-chief.

8. **Language default resolution:** `GET /teams/:id` is fetched once on mount (`{ team, members }`; `team.voice_profile.default_language`) to preselect the segmented control, falling back to `'bangla'` if the team has no profile yet — mirroring the backend's own `resolveVoiceOptions` fallback order (request override → team default → `'bangla'`). Switching language mid-session only affects the *next* generate/regenerate call; already-rendered cards are untouched.

9. **Drafts page is a thin, separate route** (`pages/dashboard/Drafts.tsx`, new `userPaths` entry, icon `FileText`) — not a tab inside Generate. It lists via `listDrafts({ team_id, status?, source? })`, shows status chips (draft/amber, approved/emerald, dismissed/muted) and a source badge (auto/manual), expands a draft in place to preview its formats with copy buttons, and calls `updateDraftStatus` on Approve/Dismiss with a react-query cache invalidation (`queryClient.invalidateQueries(['drafts', ...])`) so the row updates without a full reload.

## Risks / Trade-offs

- **[Single-level undo]** → intentional simplicity per the parent plan; a fuller history stack is explicitly out of scope for v1.
- **[Feature-detection adds one extra request (`GET /style-packs`) on every Generate page load]** → small, cacheable via react-query, and necessary since there's no cheaper way to know whether the select should render.
- **[Regenerate/refine both cost a real LLM call each time]** → no client-side rate limiting is added (matches the backend's own stance — an explicit non-goal in the generation plans); acceptable at hackathon scale.

## Migration Plan

- Purely additive frontend work; no data migration. `/dashboard/generate` reverts to its 8A-era placeholder-adjacent state on rollback (still receiving the feed hand-off state, just not consuming it) with no other page depending on this change's output.
- The Drafts route is new — a straightforward revert removes the route entry and page.

## Open Questions

None — the API contract, degradation behavior, and component boundaries are fully pinned by the plan's design decisions and grounded against the current backend/frontend code in this session.
