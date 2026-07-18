import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLastIngestedAt } from '@/lib/api/news';

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 2-5 min per design.md decision 2 — modest relative to the 3h default ingestion cadence.

/**
 * Detects when a new ingestion run (manual or cron) has completed since this session last knew
 * about one, and invalidates the `['news']` query key so the Feed refreshes — for any
 * authenticated user, regardless of role. Mounted once at a shared layout level (Navbar) so it
 * keeps polling across route changes, not restarted per-page.
 *
 * TanStack Query v5 removed `onSuccess`/`onError` from `useQuery` — change detection here is done
 * via a `useRef` + `useEffect` watching the returned `data`, not a query-level callback.
 */
export function useNewsIngestionWatcher(): void {
  const queryClient = useQueryClient();
  const lastSeenRunId = useRef<string | null | undefined>(undefined);

  const { data } = useQuery({
    queryKey: ['last-ingested-at'],
    queryFn: getLastIngestedAt,
    refetchInterval: POLL_INTERVAL_MS,
    // A failed poll tick should never surface as a user-facing error — just skip this cycle.
    retry: false,
    throwOnError: false,
  });

  useEffect(() => {
    if (!data) return;
    if (lastSeenRunId.current === undefined) {
      // First observation this session — record it, don't invalidate (nothing "changed" yet).
      lastSeenRunId.current = data.run_id;
      return;
    }
    if (data.run_id !== lastSeenRunId.current) {
      lastSeenRunId.current = data.run_id;
      queryClient.invalidateQueries({ queryKey: ['news'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
