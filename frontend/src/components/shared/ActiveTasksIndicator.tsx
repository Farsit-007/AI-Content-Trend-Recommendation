import { useMutationState } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

/** Mutation keys tracked here — every mutation that represents a background-ish task the user
 *  might navigate away from mid-flight (ingestion, content generation, chat) must set one of
 *  these as its `mutationKey` for it to show up in this indicator. */
const TRACKED_TASK_KEYS = ['ingestion', 'content-generation', 'chat'] as const;

const TASK_LABELS: Record<(typeof TRACKED_TASK_KEYS)[number], string> = {
  ingestion: 'Ingestion',
  'content-generation': 'Generating',
  chat: 'Chat',
};

/**
 * App-wide indicator for in-flight background tasks, mounted once in the shared Navbar (outside
 * the routed page tree) so it stays visible across navigation — reads TanStack Query's own
 * MutationCache via `useMutationState`, no separate store needed. A mutation already in flight
 * when the user navigates away keeps running (TanStack Query mutations aren't tied to component
 * lifecycle); this component is purely about making that visible from anywhere in the dashboard.
 */
export function ActiveTasksIndicator() {
  const pendingKeys = useMutationState({
    filters: {
      predicate: (mutation) =>
        mutation.state.status === 'pending' &&
        TRACKED_TASK_KEYS.includes(mutation.options.mutationKey?.[0] as never),
    },
    select: (mutation) => mutation.options.mutationKey?.[0] as (typeof TRACKED_TASK_KEYS)[number],
  });

  if (pendingKeys.length === 0) return null;

  const uniqueLabels = [...new Set(pendingKeys.map((key) => TASK_LABELS[key] ?? key))];

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">
      <Loader2 className="size-3 animate-spin" />
      <span className="hidden sm:inline">{uniqueLabels.join(', ')} running…</span>
      <span className="sm:hidden">{pendingKeys.length}</span>
    </div>
  );
}
