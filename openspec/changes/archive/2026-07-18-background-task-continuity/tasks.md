## 1. Content generation: durable auto-save

- [x] 1.1 Check `generatedContent.interface.ts`'s `source` enum; decide whether interactive
      auto-saves reuse the existing manual value or need a new one (see design.md Open Questions).
      Reuses the existing `'manual'` value — no schema change needed.
- [x] 1.2 In `Generate.tsx`, on `generateMutation.onSuccess`, call the existing `saveDraft`
      (or equivalent create-draft call) with the fresh result, in addition to (not instead of)
      updating the local `editor` state — so the draft exists in Mongo even if the component has
      already unmounted by the time this fires. Implemented via a dedicated `autoSaveMutation`
      (separate from the explicit `saveMutation`, so each carries its own toast messaging).
- [x] 1.3 Add a success toast to `generateMutation` (currently only `onError` has one). Implemented
      via `autoSaveMutation`'s own success toast ("Generated — auto-saved as a draft"), which fires
      right after generation completes — avoids a separate, redundant "generation done" toast.
- [x] 1.4 Decide and implement the "Save as draft" button's behavior once a draft already exists
      from step 1.2 (update-in-place vs. no-op vs. relabeled) — a small UX decision, not a new
      endpoint. **Decided: left as-is (always creates a new draft on explicit click).** No
      update-in-place endpoint exists (`PATCH /generated-content/:id` is status-only), and adding
      one was out of scope for a frontend-only change. The auto-saved draft is the safety net (raw
      LLM output); an explicit "Save" after editing legitimately creates a second, edited draft —
      the existing Drafts-page dismiss action already handles pruning either one.
- [x] 1.5 Apply the same auto-save-on-success treatment to `regenerateMutation` (per-card
      Regenerate) — it already independently calls `generateContent` for a single format.
      **Decided not to auto-save on every regenerate.** Reasoning: (a) there's no update-in-place
      endpoint, so each regenerate would create a *new*, single-format-only draft fragment rather
      than updating the already-safety-netted full draft from the initial generate, quickly
      cluttering the Drafts list on routine iteration; (b) a regenerate is a small, fast, per-format
      tweak the user is normally actively engaged with (unlike the multi-format, slower initial
      Generate click the reported issue was actually about), so the lost-work risk is materially
      smaller. `regenerateMutation` still got `mutationKey: ['content-generation']` (task 2.1) so
      it's covered by the active-tasks indicator even without auto-save.

## 2. Active-tasks indicator

- [x] 2.1 Add explicit `mutationKey`s to the three relevant mutations: ingestion trigger
      (`Admin.tsx`), content generation (`Generate.tsx`'s `generateMutation`/`regenerateMutation`),
      and chat (`Chat.tsx`'s `chatMutation`).
- [x] 2.2 Build a small shared component (`ActiveTasksIndicator.tsx`) using
      `useMutationState({ filters: { predicate, status: 'pending' } })` to read status across all
      three keys; renders a compact "N task(s) running" affordance when any is pending, nothing
      otherwise. (Completion surfacing is already handled by each mutation's own success/error
      toast, which — per `background-task-continuity`'s design.md finding — already fires
      regardless of the current page; a second "just finished" signal in the indicator itself would
      be redundant.)
- [x] 2.3 Mount it in the shared dashboard layout (`Navbar.tsx`, rendered once by `MainLayout.tsx`
      outside `<Outlet/>`) so it's visible on every `/dashboard/*` page, not just the page that
      started the task.

## 3. Missing success toasts

- [x] 3.1 Confirm `Chat.tsx`'s success path has user-visible feedback beyond the reply appearing
      inline. **Decided: left as-is, no new toast.** The active-tasks indicator now shows "Chat
      running…" while pending, and the reply appearing inline is itself the completion signal — an
      additional toast would be redundant noise for an action whose result is already visible on
      the same page in the common case.

## 4. Verification

- [x] 4.1 `cd frontend && npm run build && npm run lint` — clean (build clean; same 4 pre-existing,
      unrelated lint errors as every prior session — TourOverlay.tsx, sidebar.tsx, use-mobile.ts).
- [ ] 4.2 Manual: start a generation, navigate away before it resolves, confirm the draft appears in
      Drafts once it completes and the active-tasks indicator reflected it running, then completing.
      **Not done in this pass** — requires a running dev server + browser session.
- [ ] 4.3 Manual: trigger ingestion as admin, navigate away, confirm the active-tasks indicator
      shows it running elsewhere in the app and updates when the ingestion-runs history reflects
      completion. **Not done in this pass** — requires a running dev server + browser session.
