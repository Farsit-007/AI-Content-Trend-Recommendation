## Why

This is the vision's demo moment: "like a Canva for content writers… just click, tweak, copy paste with no extra effort" (V3/V9/V10). Change 8A gave the app a real feed with a "Generate content" hand-off; today that hand-off lands on a "Coming soon" placeholder. Every generation capability shipped in plans 6-7 — per-format long-form generation, style packs, fact-grounding, regenerate, instruction-based refine, and draft persistence — is invisible until this change ships the editor that surfaces them.

## What Changes

- New `lib/api/content.ts`: typed `generateContent` (topic/news_item_id/language/style_pack_id/formats/regenerate), `refineContent`, `saveDraft`, `listDrafts`, `updateDraftStatus`.
- New `lib/api/stylePacks.ts`: `listStylePacks`.
- `/dashboard/generate` becomes a real Canva-style editor: entry either from feed router state (a context card showing the source news item) or a manually typed topic; controls for language (segmented control, team default preselected), style pack (select, hidden if the endpoint errors or returns nothing), and format toggles (Facebook + LinkedIn on by default, reel/YouTube/caption on demand).
- Generating shows per-format skeletons, then a `FormatCard` per result: an editable auto-growing textarea, a live platform-aware length counter (amber outside the target range, never blocking), one-click Copy with a confirmation toast and transient copied state, per-format Regenerate (that format only), and instruction-chip refinement (fixed chips plus free text) with a single-level Undo. `youtube_idea` renders as a structured card (title/hook/chapters/thumbnail) with copy-as-text.
- Save draft persists the current editor state (including any edits/refinements) as a manual `GeneratedContent` document via the new `POST /generated-content` endpoint.
- New `/dashboard/drafts` page: the team's generated content with status/source filters, expandable per-format previews with copy, and Approve/Dismiss actions against the existing `PATCH /generated-content/:id`.
- Endpoints or capabilities that might not be deployed (refine/save-draft, style packs) are feature-detected once per page mount and degrade to hidden controls or an informative toast — the page must never hard-crash against an older backend, even though today's backend already has every capability this change consumes.

## Capabilities

### New Capabilities
- `frontend-generate`: the Generate editor page (entry, controls, per-format cards, refine, regenerate, save) and the Drafts page.

## Impact

- Frontend: new `lib/api/content.ts`, `lib/api/stylePacks.ts`, `components/generate/{FormatCard,GenerateControls,YoutubeIdeaCard}.tsx`, rewritten `pages/dashboard/Generate.tsx`, new `pages/dashboard/Drafts.tsx`, a new `userPaths` entry (`routes/user.routes.tsx`) for the Drafts route + sidebar item.
- No backend changes — this change consumes `POST /content/generate`, `POST /content/refine`, `GET/POST /generated-content`, `PATCH /generated-content/:id`, and `GET /style-packs` exactly as they exist today (all already applied via plans 6A/6B/7A/7B/7C).
- Depends on change 8A (`frontend-feed-page`, already applied) for the feed-to-generate hand-off's router-state shape (`{ newsItemId, topic }`).
