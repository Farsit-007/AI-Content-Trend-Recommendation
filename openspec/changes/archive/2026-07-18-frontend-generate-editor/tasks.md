## 1. API layer

- [x] 1.1 `frontend/src/lib/api/content.ts`: `FormatId` union (mirrors backend's five), `YoutubeIdea` interface, `GeneratedFormats = Partial<Record<FormatId, string | YoutubeIdea>>`; `generateContent(payload: { team_id; topic; news_item_id?; language?; style_pack_id?; formats?: FormatId[]; regenerate?: boolean }): Promise<{ topic: string } & GeneratedFormats>` via `apiPost('/content/generate', payload)`; `refineContent(payload: { team_id; format: FormatId; current_text; instruction; language?; style_pack_id? }): Promise<{ revised_text: string }>` via `apiPost('/content/refine', payload)`; `GeneratedContentDto` interface (`_id, team_id, news_item_id?, topic, formats: GeneratedFormats, source: 'auto'|'manual', status: 'draft'|'approved'|'dismissed', model_used?, created_at`); `saveDraft(payload: { team_id; news_item_id?; topic; formats: GeneratedFormats; model_used? }): Promise<GeneratedContentDto>` via `apiPost('/generated-content', payload)`; `listDrafts(params: { team_id; status?; source?; page?; limit? }): Promise<{ data: GeneratedContentDto[]; meta?: Meta }>` via `apiGetList`; `updateDraftStatus(id, status): Promise<GeneratedContentDto>` via `apiPatch`
- [x] 1.2 `frontend/src/lib/api/stylePacks.ts`: `StylePackDto` interface (`_id, name, slug, description?, language, tone_tags: string[], is_active`); `listStylePacks(): Promise<StylePackDto[]>` via `apiGet('/style-packs')` (backend returns a plain array in `data`, no pagination envelope)

  **Implementation note:** also added a small `lib/api/teams.ts` with just `getTeam(id)` — design.md's language-default resolution (§Design-8) needs `GET /teams/:id`, and no team API module existed yet (change 8C's plan is to build the full one). Scoped to the one read this change needs; 8C extends the same file rather than replacing it.

## 2. Generate components

- [x] 2.1 `components/generate/FormatCard.tsx`: `FormatId`, current text, `onChange`, `onRegenerate`, `onRefine(instruction)`, `busy` states — auto-growing `<textarea>` (resize on input via scrollHeight), live counter per §Design-7 (words for `facebook_post`, chars for `linkedin_post`/`caption`/`facebook_reel_script`, amber outside target), Copy button (Clipboard API + `toast.success` + a 1.5s transient "Copied" label swap), Regenerate button, four fixed instruction chips + free-text input (≤300 chars) wired to `onRefine`, Undo button (visible only when a `previousText` slot is populated), all refine/regenerate controls disabled while that card's mutation is in flight
- [x] 2.2 `components/generate/GenerateControls.tsx`: context card (news item title + source link) when `newsItemId` is present, else a topic `<Input>`; language segmented control (bangla/english/banglish, team default preselected); style-pack `<select>` (only rendered when `listStylePacks()` succeeds with ≥1 pack); format toggle chips (facebook_post + linkedin_post pre-toggled on); Generate button (disabled when no topic and no news item, or while generating)
- [x] 2.3 `components/generate/YoutubeIdeaCard.tsx`: structured render (title, hook, ordered chapters list, thumbnail concept) + a "Copy as text" button that serializes the object into a readable plain-text block before copying; no refine controls (backend excludes this format from `/content/refine`)
- [x] 2.4 `pages/dashboard/Generate.tsx`: `useLocation()` reads `{ newsItemId?, topic? }` state; `GET /teams/:id` fetched once for the language default (§Design-8); `listStylePacks` feature-detection query; per-format editor state (`Record<FormatId, { text: string | YoutubeIdea; previousText?: string | YoutubeIdea }>`); `useMutation` for `generateContent` (seeds editor state from the response's present keys per §Design-1), a separate `useMutation` for per-card regenerate, a separate `useMutation` for per-card refine; Save draft button calling `saveDraft` with every populated format, success/error toasts

## 3. Drafts page

- [x] 3.1 `pages/dashboard/Drafts.tsx`: status/source filter controls, `listDrafts` query keyed on `{ team_id, status, source }`, status chips (draft/approved/dismissed) + source badge (auto/manual), expand-in-place per-format preview with copy, Approve/Dismiss buttons calling `updateDraftStatus` with `queryClient.invalidateQueries` on success
- [x] 3.2 `routes/user.routes.tsx`: add a `{ name: 'Drafts', path: 'drafts', element: <Drafts />, icon: FileText }` entry

## 4. Verification

- [x] 4.1 `cd frontend && npm run build && npm run lint`

  **Note:** `npm run build` fully clean. `npm run lint` has the same 2 pre-existing, unrelated errors noted in change `frontend-feed-page` (`components/ui/sidebar.tsx`, `hooks/use-mobile.ts`) — untouched by this change either.
