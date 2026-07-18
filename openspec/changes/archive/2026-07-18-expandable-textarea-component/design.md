## Context

Verified against the current tree: `FormatCard.tsx`'s textarea already implements manual auto-grow inline
(`el.style.height = 'auto'; el.style.height = scrollHeight + 'px'` inside its `onChange` handler) but has no
expand-to-fullscreen affordance, no `resize` CSS, and this logic is duplicated nowhere else — every other
textarea in the app (`StylePacks.tsx` ×2, `VoiceProfileSection.tsx`, `BrandVoiceSection.tsx`) is a plain fixed-
`rows` `<textarea>` with `resize-none`. A Radix-based `Dialog` primitive already exists
(`components/ui/dialog.tsx`, shadcn-style: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/
`DialogDescription`, default `max-w-lg` overridable via `className`) — no new dependency needed.
`VoiceProfileSection.tsx` binds its textarea via react-hook-form's `<FormField render={({field}) => <textarea
{...field} .../>}>` pattern, which spreads `{value, onChange, onBlur, name, ref}` — any replacement component
must accept exactly that same prop shape to drop in without adapter code.

## Goals / Non-Goals

**Goals:**
- One component, one behavior contract, used everywhere free text is entered in this app today.
- Behaves as a true `<textarea>` drop-in: same `value`/`onChange`/`onBlur`/`name`/`ref`/`placeholder`/
  `disabled`/`maxLength` props work unchanged, so existing call sites (including the react-hook-form spread
  in `VoiceProfileSection.tsx`) need no restructuring beyond swapping the element.
- Auto-grow behavior generalizes what `FormatCard.tsx` already does today (proven in production) rather than
  a new untested growth algorithm.
- The full-view modal is a bigger *editing surface* for the same draft, not a save/cancel boundary — closing
  it must never discard anything, matching how ChatGPT/Claude's own expand view works.

**Non-Goals:**
- No rich-text/markdown editing — plain text only, matching every existing call site's actual data (post
  drafts, instructions, style examples are all plain strings server-side).
- No autosave/draft-recovery beyond whatever the parent's own `value` state already provides — this component
  is purely presentational/interaction, not a new persistence layer.
- No changes to any backend validation limits (`custom_instructions` stays capped at 500 chars server-side,
  `content` at 8000, etc.) — the component surfaces existing `maxLength` constraints, it doesn't loosen them.

## Decisions

### 1. Single component, controlled via ordinary `value`/`onChange`, two render layers

```tsx
interface ExpandableTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> {
  maxAutoGrowPx?: number; // default 320
  expandable?: boolean;   // default true — set false for e.g. the small refine box if it ever needs to opt out
  expandTitle?: string;   // dialog heading, e.g. "Edit Facebook post"
}
```
Internally: an inline `<textarea>` (auto-grow + `resize-y` CSS) plus an "expand" icon button (top-right
corner, only rendered when `expandable`) that opens a `Dialog` whose `DialogContent` renders a second,
larger `<textarea>` bound to the *same* `value`/`onChange` props — both textareas are controlled by the
parent's single piece of state, so typing in either one is immediately reflected in the other (no internal
component state to reconcile, no risk of the modal and inline view drifting apart).

### 2. Auto-grow generalizes `FormatCard.tsx`'s existing technique, capped by `maxAutoGrowPx`

```ts
const handleInput = () => {
  const el = ref.current;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, maxAutoGrowPx)}px`;
};
```
Below the cap, the box grows with content (today's proven `FormatCard` behavior, now shared). At/above the
cap, height stops growing and the textarea's own internal scrollbar takes over — this is what keeps a
100-example bulk-import paste from pushing the rest of the page off-screen while still giving short content
(a single Facebook post) a fully visible, no-scroll box.

### 3. Manual resize via native `resize: vertical`, not a custom drag handle

`resize: vertical` CSS on the textarea is enough — browsers already render a drag handle in the
bottom-right corner, it works with keyboard/touch, and needs zero JS. A user can drag taller than
`maxAutoGrowPx` if they want more visible room than the auto-grow cap allows; the component doesn't fight
a manual resize once the user has done one (standard textarea semantics — `style.height` set via JS is
simply overridden by the user's own drag, and the next `onInput`-triggered auto-grow recalculation still
works correctly off the textarea's *current* `scrollHeight*, whichever value that is at that moment).

### 4. Full-view modal reuses `components/ui/dialog.tsx`, with a wide override

`DialogContent`'s default `max-w-lg` is overridden per-usage (`className="max-w-3xl"` or similar) — the
modal's own textarea is unstyled-tall (`rows={20}` equivalent via `min-h-[60vh]`), no `resize` cap inside the
modal (the modal itself is already the "give me more room" affordance, so no separate resize/auto-grow inside
it — a plain full-height textarea is simplest and correct there).

### 5. Prop-compatible with react-hook-form's `field` spread

Since `ExpandableTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>`, a call site can do
`<ExpandableTextarea {...field} rows={4} />` exactly like today's raw `<textarea {...field} .../>` in
`VoiceProfileSection.tsx` — no new wrapper, no `Controller`, no behavior change to how react-hook-form tracks
the field.

## Risks / Trade-offs

- **[Risk] Two textareas bound to the same `value` means two DOM nodes re-render on every keystroke** (inline
  + the modal's, when open) — negligible in practice (these are short-lived, human-typing-speed updates on
  plain-text fields, not a hot render path), and the modal's textarea only exists in the DOM while the dialog
  is open (Radix Dialog unmounts closed content).
- **[Trade-off] No word-processor-grade editing (undo/redo history beyond the browser's native textarea undo,
  no rich text)** → Accepted: none of the five call sites need more than plain-text editing; `FormatCard.tsx`
  already has its own explicit Undo button wired to `previousText`, unrelated to and unaffected by this change.

## Migration Plan

No data migration — this is a pure UI component swap. Rollback is trivial (revert the four call-site edits;
the new component file being unused is harmless). No backend involvement at all, so no deployment sequencing
concerns.

## Open Questions

None — fully scoped by the user's explicit answers (all 5 call sites confirmed, `Dialog` primitive confirmed
present).
