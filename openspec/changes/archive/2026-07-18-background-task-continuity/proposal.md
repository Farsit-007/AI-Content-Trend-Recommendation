## Why

Reported: if a user triggers ingestion, a chat message, or content generation and then navigates to
another page, "the task should work in background." Investigation shows the underlying HTTP
request already runs to completion server-side regardless of navigation — Node doesn't cancel a
request in flight just because the browser tab changed routes, and this codebase's mutations don't
wire up any `AbortController` that would cut it short. The real gaps are all on the frontend side:

1. **Content generation results are never durably saved unless the user manually clicks "Save as
   draft" before leaving.** `generateMutation`'s `onSuccess` (`Generate.tsx`) only calls local
   `setEditor(...)` — if the component has unmounted (user navigated away) before the LLM call
   resolves, that `setState` is silently dropped by React and the generated text is gone forever,
   even though the LLM call it paid for actually succeeded. There's no toast on generation success
   either, so even a user who stays on the page has no explicit "done" signal.
2. **No app-wide indicator that a triggered task (ingestion, generation, chat) is running or just
   finished**, so a user who navigates away has no way to tell if/when it completed without going
   back to the exact page that started it.
3. **Chat's turn state is local component state** (`Chat.tsx`'s `messages` useState) — a reply that
   finishes after the user has left the page is lost from the UI (though it is persisted to
   `ChatMessage` server-side — see the separate `chat-conversation-history` proposal for making that
   durable history actually retrievable).

Confirmed *not* an issue: `Admin.tsx`'s ingestion-trigger mutation already has an `onSuccess` that
toasts and invalidates the `news`/`ingestion-runs` query keys — and TanStack Query mutation-level
callbacks (the ones passed to `useMutation(...)`, as distinct from callbacks passed to an individual
`.mutate(fn, { onSuccess })` call) are attached to the `Mutation` object itself, not to the
component's subscription, so they fire even after the triggering component unmounts. This already
means ingestion's own cache-refresh survives navigation today. The gap for ingestion is narrower:
there's no persistent, cross-page "ingestion is running" indicator.

## What Changes

- **Content generation**: auto-persist every successful interactive `generateContent` result as a
  `GeneratedContent` draft (`source: 'manual'`) immediately on success, not only when the user
  explicitly clicks "Save as draft" — eliminates the lost-work risk entirely. Add a success toast.
- **Global "active tasks" indicator**: a small, persistent UI element (e.g. in the top navbar) that
  shows in-flight/just-finished ingestion, content-generation, and chat requests from anywhere in
  the app, backed by TanStack Query's built-in `useMutationState` (no new dependency) keyed by
  explicit `mutationKey`s given to the three mutations.
- Add missing success toasts (content generation, chat) so a background completion is visible via
  toast regardless of which page the user is on when it lands (the `<Toaster/>` is already mounted
  at the app root, outside the routed page tree, so toasts already display app-wide today —
  they're just missing on a couple of success paths).
- **No backend changes required** — the pipeline/LLM calls already run independently of the
  triggering HTTP connection's frontend consumer; this change is entirely about frontend
  observability and not losing already-successful work.

## Capabilities

### New Capabilities
- `background-task-visibility`: what remains visible/durable across navigation for ingestion,
  content generation, and chat, and how in-flight/completed state is surfaced app-wide.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- **Frontend:** `Generate.tsx` (auto-save on generate success, success toast), a new
  `useMutationState`-backed active-tasks indicator component (navbar or similar shared layout
  location), `mutationKey`s added to the ingestion-trigger, content-generation, and chat mutations.
- **Backend:** none — `POST /content/generate`'s existing response is sufficient; auto-persisting is
  a new frontend-triggered call to the already-existing `saveDraft`/create-draft endpoint.
- **Non-goal:** no job-queue/worker infrastructure (Bull/BullMQ/etc.) — not needed, since the actual
  execution already isn't tied to the frontend connection; this is purely a UI-state durability and
  visibility fix.
