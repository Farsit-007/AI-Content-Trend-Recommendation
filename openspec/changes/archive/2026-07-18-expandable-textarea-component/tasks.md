## 1. Component

- [x] 1.1 `frontend/src/components/ui/expandable-textarea.tsx`: `ExpandableTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>` plus `maxAutoGrowPx?`, `expandable?`, `expandTitle?`; forwards a ref (via `useImperativeHandle`), generalizes `FormatCard.tsx`'s auto-grow technique (capped at `maxAutoGrowPx`, default 320), re-runs on every `value` change (not just direct typing) so programmatic updates (e.g. Regenerate) resize correctly too
- [x] 1.2 `resize-y` CSS on the inline textarea for native manual resize
- [x] 1.3 Expand affordance (`Maximize2` icon button, top-right) rendered when `expandable !== false`, opening a `Dialog` with a wide `DialogContent` (`max-w-3xl`) containing a second textarea bound to the same `value`/`onChange`
- [x] 1.4 Confirmed both textareas share one source of truth — no internal text state, only `open` (modal visibility) is component-local

## 2. Wire into the 5 call sites

- [x] 2.1 `FormatCard.tsx`: output textarea replaced with `<ExpandableTextarea>`; removed the now-redundant inline auto-grow handler and `textareaRef`/`useRef` import (superseded by the shared component's internal ref)
- [x] 2.2 `FormatCard.tsx`: refine free-text `<Input>` replaced with `<ExpandableTextarea rows={1} maxAutoGrowPx={120}>` — resolved the Enter-key question by **preserving the original bare-Enter-submits behavior** (`e.key === 'Enter' && !e.shiftKey` → submit) rather than the design doc's alternate suggestion, since minimizing behavior change for existing users mattered more than the Shift+Enter-to-submit convention; Shift+Enter now inserts a newline, which the plain `<Input>` could never do at all
- [x] 2.3 `StylePacks.tsx` (`PackExamples`): both the single-add and bulk-import (JSON, `maxAutoGrowPx={480}`, `font-mono`) textareas replaced
- [x] 2.4 `VoiceProfileSection.tsx`: `custom_instructions` textarea (react-hook-form `{...field}` spread) replaced — character counter confirmed still reads `form.watch('custom_instructions')` unchanged, no wiring needed
- [x] 2.5 `BrandVoiceSection.tsx`: example-content textarea replaced

## 3. Verification

- [x] 3.1 `cd frontend && npm run build` — clean
- [x] 3.2 `cd frontend && npm run lint` — clean on every file this change touched (4 pre-existing errors/1 warning remain in unrelated files: `VoiceProfileSection.tsx`'s react-hook-form `watch()` memoization warning, `TourOverlay.tsx`, `sidebar.tsx`, `use-mobile.ts` — none introduced by this change)
- [x] 3.3 Live browser verification via a Playwright script (no project run-skill existed for this repo; `chromium-cli` wasn't available in this environment, so drove a standalone Playwright script instead — both dev servers started, killed cleanly afterward): logged in as super-admin, navigated to the Style Packs admin page, dismissed an unrelated pre-existing "welcome tour" modal that happened to be in the way, typed multi-line content into the "add example" `ExpandableTextarea` and confirmed the box visibly auto-grew (screenshotted), clicked the expand button and confirmed the full-view modal opened with the correct title and content (screenshotted — modal renders exactly as designed: dark backdrop, "Add style example" heading, large textarea, close button), typed *different* text inside the modal, pressed Escape, and confirmed the inline textarea's value updated to exactly match what was typed in the modal — proving the live-sync contract from design.md decision 1 holds in a real browser, not just in isolation. Two console 401s were captured and traced to `POST /auth/refresh-token`, confirmed via `tokenStore.ts`'s own documentation comment to be expected behavior on every hard page reload (the in-memory-only access token is intentionally re-minted from the httpOnly cookie on boot) — unrelated to this change, which makes no API calls at all. No data was persisted during the test (the "Add" button was never clicked), so no cleanup was needed.
