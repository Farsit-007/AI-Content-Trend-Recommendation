## Context

Confirmed by reading the code directly:
- `Admin.tsx`'s ingestion-trigger `useMutation` already does
  `queryClient.invalidateQueries({ queryKey: ['news'] })` on success — the manual path is already
  correct and (per `background-task-continuity`) already survives navigation away from the Admin
  page, since TanStack Query v5 fires mutation-level `onSuccess` regardless of component mount state.
- `newsItem.route.ts` gates `GET /news-items/ingestion-runs` behind `requireAdmin` — confirmed by
  direct inspection, not assumed. Regular team members (role `user`), who are the Feed page's normal
  daily audience, cannot call it; a naive design polling this endpoint from the Feed page would 403
  for most of the user base.
- `IngestionRun` (`ingestionRun.model.ts`) already stores `started_at`/`finished_at`/`trigger`/
  `total_stored`/`sources`/`error` per run, with cron runs (`trigger: 'cron'`) persisted identically
  to manual ones by `runIngestionPipeline` — so "has a new run completed" is answerable purely from
  data that already exists, for both trigger types uniformly.
- `queryClient.ts`'s defaults: `staleTime: 30_000`, no `refetchInterval` anywhere, default
  `refetchOnWindowFocus` (true in TanStack Query v5 unless overridden — not overridden here). This
  already gives *some* eventual freshness on a tab-switch, but nothing for a continuously-focused,
  never-switched-away tab.
- This app is on TanStack Query v5, which **removed** `onSuccess`/`onError`/`onSettled` callbacks
  from `useQuery` (a v4→v5 breaking change) — the polling hook below cannot rely on a query-level
  success callback and must instead react to the query's returned `data` via `useEffect`.

## Goals / Non-Goals

**Goals:**
- Any authenticated user (any role) sees the news feed refresh within a bounded time of an
  ingestion run completing, whether that run was manual or cron-triggered.
- Minimal added load: no full news-list refetch on every poll tick, only on an actual detected
  change.

**Non-Goals:**
- No WebSocket/SSE push — a short poll interval on a tiny endpoint is simple, cheap, and sufficient
  given ingestion's own cadence (every 3 hours by default via `NEWS_INGESTION_CRON`); revisit only
  if a real need for sub-poll-interval immediacy emerges.
- No change to `GET /news-items/ingestion-runs` itself (stays admin-only, unchanged) — the new
  endpoint is deliberately narrower (id + timestamp only, no per-source detail, no error messages)
  precisely so it's safe to expose to every authenticated user without leaking operational detail
  that the admin-only endpoint intentionally reserves for admins.

## Decisions

1. **New endpoint returns only `{ run_id, finished_at }` (or `null` if no run exists yet) — nothing
   else from `IngestionRun`.** This is the minimum needed to detect change, and deliberately doesn't
   expose per-source counts, errors, or trigger type to non-admin callers — keeping the existing
   admin-only endpoint as the place for that operational detail, unchanged.
2. **Poll interval: a fixed, modest cadence (e.g. 2–5 minutes)** via the new small query's own
   `refetchInterval` — cheap enough to run continuously for every logged-in session; short enough
   relative to the 3-hour default cron cadence that "a few minutes of staleness after a run
   completes" is an acceptable bound, not a real gap.
3. **Change detection via `useEffect` + `useRef`, not a query-level callback** (per Context: v5 has
   no `onSuccess` on `useQuery`). The polling hook keeps a ref of the last-seen `run_id`; when the
   small query's `data.run_id` differs from the ref on a render, it calls
   `queryClient.invalidateQueries({ queryKey: ['news'] })` and updates the ref — this runs exactly
   once per actual change, not once per poll tick.
4. **Mounted once, at a shared layout level (not per-page)** — so the check runs continuously across
   `/dashboard/*` navigation, not restarted/lost every time the user changes pages (a `useQuery`
   with a stable `queryKey` mounted at a layout level keeps polling via React Query's own
   background-refetch machinery regardless of which child route is active).
5. **`invalidateQueries` on `['news']`, not a raw `refetch()`** — matches the existing manual-trigger
   pattern in `Admin.tsx` exactly, and correctly refreshes every currently-mounted news query
   (Feed's `useInfiniteQuery`, and any other page reading the same key), not just one instance.

## Risks / Trade-offs

- [Invalidating an infinite-scrolled Feed query mid-session] → TanStack Query's `invalidateQueries`
  on an active infinite query refetches every already-loaded page in sequence, preserving scroll
  depth (not resetting to page 1) — existing, well-documented behavior, not something this change
  needs to build itself.
- [Poll interval trade-off: too short wastes requests, too long defeats the purpose] → the chosen
  cadence (2–5 min) is proportionate to the 3-hour default ingestion cadence; make it configurable
  only if a real need to tune it shows up.
- [A user's session with the endpoint down/erroring shouldn't break the Feed] → the polling hook's
  failure mode should be silent (log only, no toast/error UI) — a missed poll tick just means one
  cycle of staleness, not a user-facing error.

## Migration Plan

Backend: one new additive, non-breaking endpoint. Frontend: new polling hook, no changes to
existing query shapes. No data migration. Rollback is a plain revert of the new route and hook.

## Open Questions

None.
