## Context

Confirmed by reading the code directly:
- A single `QueryClient` is created once in `main.tsx` and provided at the app root — it (and its
  `MutationCache`) survives every route change; it is not re-created per page.
- TanStack Query v5's mutation-level `onSuccess`/`onError`/`onSettled` (the ones passed to
  `useMutation({...})`, not to an individual `mutate(fn, { onSuccess })` call) are invoked by the
  `Mutation` object as part of executing the mutation, independent of whether any component is
  still subscribed/mounted — this is a well-documented TanStack Query behavior (and a common source
  of "can't update state on an unmounted component" confusion elsewhere). `Admin.tsx`'s ingestion
  mutation already relies on this: its `onSuccess` toasts and invalidates `['news']`/
  `['ingestion-runs']` and this already fires even if the admin has navigated away.
- `Generate.tsx`'s `generateMutation.onSuccess` only calls `setEditor(...)`, a local `useState`
  setter — if the component is unmounted when this fires, React silently no-ops the update (no
  warning in React 18+, no error), so the generated text is unrecoverable. `saveDraft` is a
  *separate*, explicitly-triggered mutation (`saveMutation`) — nothing calls it automatically.
- `<Toaster/>` (`components/ui/sonner.tsx`) is mounted once in `main.tsx`, outside `<RouterProvider>`
  entirely — a `toast()` call from any mutation callback renders regardless of the current route.

## Goals / Non-Goals

**Goals:**
- No successfully-generated content is ever silently lost due to navigation.
- A user can tell, from any page, whether a background task they started is still running or has
  finished.
- Zero new backend infrastructure — the fix is entirely about not discarding results the backend
  already successfully produced.

**Non-Goals:**
- No job queue / worker process (Bull, BullMQ, Agenda, etc.) — the backend already executes
  independently of the frontend connection; introducing a queue would solve a problem that doesn't
  exist here (execution continuity) while leaving the actual gap (frontend-side result durability
  and visibility) unaddressed.
- No WebSocket/SSE push channel — `useMutationState` plus the existing invalidate-on-success pattern
  is sufficient for this scale; revisit only if a real need for cross-tab or cross-user live updates
  emerges.
- No change to chat's actual grounding/retrieval behavior — this proposal is about *visibility* of
  an in-flight/completed chat turn, not chat quality. Making history durable/retrievable across a
  full page reload is the separate `chat-conversation-history` proposal.

## Decisions

1. **Auto-persist every interactive generation result as a draft, immediately, on success.** The
   existing auto-generation job already creates `GeneratedContent` documents with `source: 'auto'`;
   this reuses the identical shape with `source: 'manual'` (or a new source value if the schema
   needs one — see Open Questions) triggered from `generateMutation.onSuccess` rather than only
   from the user's explicit `saveMutation`. The explicit "Save" action in the editor then either
   becomes a no-op (already saved) or an update-in-place to the just-created draft, not a from-blank
   create — exact UX (does "Save" text change to "Saved"/"Update"?) is left to implementation, not
   fixed here.
   Alternative considered: keep saving manual-only, and instead cache the last generation result in
   `sessionStorage`/`localStorage` for recovery. Rejected — a client-storage cache is itself lossy
   (cleared on browser data wipe, not visible in the Drafts list where a user would naturally look
   for prior work) and duplicates a persistence mechanism (`GeneratedContent`) that already exists
   and is already the correct home for this data.
2. **Active-tasks indicator built on `useMutationState`, not a new store.** TanStack Query already
   tracks every mutation's status in its `MutationCache`; `useMutationState({ filters: { mutationKey
   } })` reads it from anywhere in the component tree without prop drilling or a new
   Context/Zustand store. Requires giving the three relevant mutations explicit `mutationKey`s
   (`['ingestion']`, `['content-generation']`, `['chat']`) — none currently set one, so today
   `useMutationState` can't distinguish them from any other mutation.
3. **Success toasts added where missing (generate/regenerate, chat), not removed/changed where
   present** (ingestion already has one). Toasts alone don't solve the lost-work problem (decision
   1 does) but they close the "no feedback at all" gap for a user who stays on the page and reads
   something else while waiting.

## Risks / Trade-offs

- [Auto-persisting on every generate call could clutter the Drafts list with content the user
  never intended to keep, especially given the existing per-card "Regenerate" already fires a
  second `generateContent` call] → the existing `discardMutation`/dismiss action on the Drafts page
  already exists for pruning unwanted drafts; auto-saving every generation is a "safety net,
  optionally discarded" model, not a forced-keep model. Documented so implementation doesn't treat
  this as "no cleanup needed" — the discard path already exists and should stay available for these.
- [A very long-running ingestion request could hit a browser/proxy HTTP timeout regardless of
  frontend fixes here] → not observed in practice at current data volumes; out of scope for this
  proposal (a real backend concern, not a frontend-visibility one) — flagged as an open question,
  not solved here.

## Migration Plan

Frontend-only; no data migration. Auto-created manual drafts are ordinary `GeneratedContent`
documents, indistinguishable in storage from ones a user already saves manually today (aside from
whatever `source` value is chosen). Rollback is a plain revert — no schema change to roll back.

## Open Questions

- Does `GeneratedContent.source` need a new value (e.g. `'manual-auto-saved'`) to distinguish
  "auto-persisted from a live edit session" from today's explicit-save manual drafts, or is reusing
  the existing manual-save path (whatever value it uses today) sufficient? Needs a look at
  `generatedContent.interface.ts`'s `source` enum at implementation time.
- Should the "Save as draft" button's label/behavior change once a draft is auto-created (e.g.
  become "Update draft"), or does it stay as-is and simply become a no-op / duplicate-safe? A small
  UX call, not a data-model one.
