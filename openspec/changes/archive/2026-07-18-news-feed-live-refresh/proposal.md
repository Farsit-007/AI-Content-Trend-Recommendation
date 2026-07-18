## Why

Reported: after news ingestion runs (manually or via the cron schedule), the news list should
refresh. Investigation shows the **manual** path already works: `Admin.tsx`'s ingestion-trigger
mutation already calls `queryClient.invalidateQueries({ queryKey: ['news'] })` on success, and (per
the `background-task-continuity` proposal's finding) this fires even if the admin has navigated
away from the Admin page by the time ingestion finishes. The gap is the **cron** path: `node-cron`
runs `runIngestionPipeline('cron')` entirely server-side (`newsIngestion.cron.ts`-style scheduler,
`NEWS_INGESTION_CRON=0 */3 * * *` by default) with no browser involved at all — there is no
WebSocket/SSE/push channel of any kind, so any already-open Feed page has no way to learn that new
items landed. The frontend's query defaults (`staleTime: 30_000`, default `refetchOnWindowFocus`)
mean a tab that's simply left open, without a window-blur/focus cycle or a manual reload, can show
a feed that's hours stale relative to the last cron run.

## What Changes

- Add a small, cheap, `requireAuth`-only (not admin-gated) endpoint —
  `GET /news-items/last-ingested-at` — returning just the most recent `IngestionRun`'s `_id` and
  `finished_at`. **Correction to an initial assumption**: the obvious existing candidate,
  `GET /news-items/ingestion-runs`, is `requireAdmin`-gated (confirmed in `newsItem.route.ts`) and
  therefore unusable from the Feed page, which regular (non-admin) team members use every day — a
  new, minimal, non-admin-gated endpoint is genuinely needed, not just a reuse of an existing one.
- Add a lightweight polling hook (mounted once, e.g. in the dashboard layout) that checks this
  endpoint at a modest interval and invalidates the `['news']` query key only when the observed
  run id/timestamp actually changes — cheap regardless of role, and avoids refetching the full news
  list on every tick the way a naive `refetchInterval` on the list query itself would.
- Confirm and keep the existing manual-trigger invalidation in `Admin.tsx` as-is (already correct
  and already survives navigation per the `background-task-continuity` proposal's finding).

## Capabilities

### New Capabilities
- `news-feed-live-refresh`: how and when the news feed's cached data is invalidated in response to
  ingestion completing, whether manually or cron-triggered, for any authenticated user regardless of
  role.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- **Backend:** one new minimal endpoint, `GET /news-items/last-ingested-at` (`requireAuth` only);
  `newsItem.route.ts`, a small controller/service addition reading `IngestionRun.findOne().sort({
  finished_at: -1 })` (or equivalent) — no new collection, no schema change.
- **Frontend:** a small shared polling hook/component invalidating `['news']` on change; a new
  `lib/api/news.ts` client function for the new endpoint.
- **No breaking changes** — purely additive.
