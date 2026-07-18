## 1. Backend: minimal last-ingested-at endpoint

- [x] 1.1 `newsItem.controller.ts` (or a small addition to `IngestionRun`'s own controller): add a
      handler returning `{ run_id, finished_at }` from the most recent `IngestionRun` (sorted by
      `finished_at` descending, limit 1), or a "no run yet" shape if none exists. Implemented as
      `IngestionRunService.getLastIngestedAt` + `IngestionRunController.getLastIngestedAt` (kept in
      the `IngestionRun` module alongside `listRuns`, since it queries that same model).
- [x] 1.2 `newsItem.route.ts`: add `GET /news-items/last-ingested-at` with `requireAuth` only — must
      be placed above any `/:id`-style route so Express doesn't swallow it as an id param, mirroring
      the existing comment already in this file about `ingestion-runs`.
- [x] 1.3 Confirm no admin-only detail (per-source counts, errors, trigger type) leaks into this
      response — only id + timestamp. Verified via a dedicated test asserting the response's only
      keys are `run_id`/`finished_at`.

## 2. Backend tests

- [x] 2.1 Integration test: non-admin user can call the new endpoint successfully (contrast with the
      existing admin-only `ingestion-runs` test coverage).
- [x] 2.2 Integration test: correct "no run yet" shape when `IngestionRun` is empty.
- [x] 2.3 Integration test: reflects the most recent run after multiple runs exist (both `cron` and
      `manual` triggers). All in `ingestionRun.integration.test.ts` — 5 new tests, 14/14 passing.

## 3. Frontend: polling hook

- [x] 3.1 `lib/api/news.ts`: add a client function for `GET /news-items/last-ingested-at`.
- [x] 3.2 New hook (`useNewsIngestionWatcher`): `useQuery` on this endpoint with a modest
      `refetchInterval` (3 min); `useRef` tracking the last-seen `run_id`; `useEffect` that calls
      `queryClient.invalidateQueries({ queryKey: ['news'] })` when the observed id changes, then
      updates the ref.
- [x] 3.3 Mount the hook once at a shared dashboard-layout level (`MainLayout.tsx`, which wraps
      every `/dashboard/*` route) so it keeps running across route changes.
- [x] 3.4 Silent failure mode: `retry: false` + `throwOnError: false` on the poll query — a failed
      tick simply produces no `data` this cycle, no user-facing error/toast.

## 4. Verification

- [x] 4.1 `cd backend && npm test && npm run build` — clean (532/533 tests passing; the 1 failure is
      the same pre-existing, unrelated flaky index-build race in `newsDedupLedger.integration.test.ts`
      documented in earlier sessions — passes reliably in isolation, untouched by this change).
- [x] 4.2 `cd frontend && npm run build && npm run lint` — clean (same 4 pre-existing, unrelated
      lint errors as every prior session).
- [ ] 4.3 Manual: trigger ingestion manually, confirm Feed still refreshes (existing behavior,
      unchanged). Manual: simulate a cron-triggered run completing (or wait for one / trigger via
      script) while a non-admin user's Feed tab stays open and focused; confirm it refreshes within
      the poll interval without any manual action. **Not done in this pass** — requires a running
      dev server + browser session (and, for the cron half, either waiting out a real cron cycle or
      manually invoking `runIngestionPipeline('cron')`).
