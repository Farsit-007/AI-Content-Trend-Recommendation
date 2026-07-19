import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, History, Newspaper, Sparkles, Users } from 'lucide-react';
import { getActivityLog, type ActivityAction, type ActivityLogEntryDto } from '@/lib/api/activityLog';
import { useTeamId } from '@/lib/useTeamId';
import { cn } from '@/lib/utils';
import { PageHelp } from '@/components/dashboard/PageHelp';

type CategoryFilter = 'all' | 'content' | 'team' | 'news';

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'content', label: 'Content' },
  { value: 'team', label: 'Team' },
  { value: 'news', label: 'Feed corrections' },
];

const actionCategory = (action: ActivityAction): Exclude<CategoryFilter, 'all'> =>
  action.startsWith('content.') ? 'content' : action.startsWith('team.') ? 'team' : 'news';

const CATEGORY_ICON: Record<Exclude<CategoryFilter, 'all'>, typeof Sparkles> = {
  content: Sparkles,
  team: Users,
  news: Newspaper,
};

/** Small, dependency-free "3 hours ago" / "2 days ago" formatter — same approach as NewsCard/Overview. */
function timeAgo(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(deltaMinutes) < 60) return rtf.format(-deltaMinutes, 'minute');
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return rtf.format(-deltaHours, 'hour');
  const deltaDays = Math.round(deltaHours / 24);
  return rtf.format(-deltaDays, 'day');
}

function ActivityRow({ entry }: { entry: ActivityLogEntryDto }) {
  const Icon = CATEGORY_ICON[actionCategory(entry.action)];
  return (
    <div className="glass-card flex items-start gap-3 rounded-xl p-4">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-400/10">
        <Icon className="size-4 text-violet-700 dark:text-violet-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{entry.summary}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {entry.actor_name} · {timeAgo(entry.created_at)}
        </p>
      </div>
    </div>
  );
}

export default function ActivityLog() {
  const teamId = useTeamId();
  const [category, setCategory] = useState<CategoryFilter>('all');

  const query = useQuery({
    queryKey: ['activity-log', teamId],
    queryFn: () => getActivityLog({ team_id: teamId as string, limit: 50 }),
    enabled: Boolean(teamId),
  });

  if (!teamId) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
        <h1 className="text-lg font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground">You need to belong to a team to see its activity.</p>
      </div>
    );
  }

  const entries = (query.data?.data ?? []).filter(
    (entry) => category === 'all' || actionCategory(entry.action) === category,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <PageHelp guideKey="activity" />
      </div>
      <p className="text-sm text-muted-foreground">Who did what, across content generation, drafts, and team settings.</p>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setCategory(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              category === option.value
                ? 'border-violet-400/50 bg-violet-400/15 text-violet-800 dark:text-violet-200'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : query.isError ? (
        <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
          <AlertTriangle className="size-6 text-red-500 dark:text-red-400" />
          <p className="text-sm text-muted-foreground">Couldn't load the activity log.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
          <History className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <ActivityRow key={entry._id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
