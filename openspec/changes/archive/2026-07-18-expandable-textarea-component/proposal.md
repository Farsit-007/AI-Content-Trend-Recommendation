## Why

Every free-text content-entry surface in the frontend today is a small, fixed- or auto-height `<textarea>`
with no way to see more than a handful of lines at once: `FormatCard.tsx`'s generated-post editor (already
auto-grows on change but has no expand affordance or manual resize), `StylePacks.tsx`'s single-add and
bulk-import example boxes (fixed `rows={2}`/`rows={4}`, no resize at all), `VoiceProfileSection.tsx`'s
`custom_instructions` field, and `BrandVoiceSection.tsx`'s example-content field. Editing a 300-word Facebook
post or a multi-example bulk-import JSON blob inside a cramped box is exactly the friction the vision's
"Canva for content writers — just click, tweak, copy paste" goal is supposed to eliminate. This change adds
one reusable, ChatGPT/Claude-style expandable text-editing component and wires it into all five places.

## What Changes

- Add `frontend/src/components/ui/expandable-textarea.tsx`: a drop-in `<textarea>` replacement that (a)
  auto-grows with content up to a configurable max height before switching to internal scroll, (b) supports
  native vertical manual resize below that auto-grow behavior, and (c) has an "expand" button that opens the
  same value in a full-screen `Dialog`-based modal editor, with edits in either view staying in sync via the
  same `value`/`onChange` contract a plain `<textarea>` already uses (so it drops into existing
  `{...field}` react-hook-form spreads and plain controlled-input call sites without adapter code).
- Replace the raw `<textarea>` in `FormatCard.tsx` (generated post editor), `StylePacks.tsx` (`PackExamples`'
  single-add and bulk-import boxes), `VoiceProfileSection.tsx` (`custom_instructions`), and
  `BrandVoiceSection.tsx` (example content) with this component.
- Upgrade `FormatCard.tsx`'s refine free-text field from a single-line `<Input>` to the same component (small
  height default, still expandable) so every free-text entry point in the Generate flow behaves consistently.

## Capabilities

### New Capabilities
- `expandable-textarea-ui`: a frontend-only reusable component capability. (Frontend UI components aren't
  tracked as backend capabilities elsewhere in this repo's specs, but this proposal still documents the
  requirement/scenarios for the behavior contract, per the schema's spec-driven convention.)

### Modified Capabilities
(none — no existing backend or frontend capability spec covers this UI surface today)

## Impact

- **Frontend only** — zero backend changes, zero API changes.
- **Files:** new `frontend/src/components/ui/expandable-textarea.tsx`; edits to
  `frontend/src/components/generate/FormatCard.tsx`, `frontend/src/pages/dashboard/admin/StylePacks.tsx`,
  `frontend/src/components/team/VoiceProfileSection.tsx`, `frontend/src/components/team/BrandVoiceSection.tsx`.
- **No new dependency** — reuses the existing Radix-based `components/ui/dialog.tsx`.
- **No breaking changes** — every call site keeps its existing `value`/`onChange` (or react-hook-form
  `field`) wiring; only the rendered element changes.
