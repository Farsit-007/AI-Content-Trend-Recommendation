import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Newspaper, Sparkles, Users } from 'lucide-react';

import {
  getActivityLog,
  type ActivityAction,
  type ActivityLogEntryDto,
} from '@/lib/api/activityLog';
import { useTeamId } from '@/lib/useTeamId';
import { formatDate, timeAgo } from '@/lib/datetime';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/dashboard/PageHeader';

const ALL = 'all';
const PAGE_SIZE = 25;

type CategoryFilter = typeof ALL | 'content' | 'team' | 'news';

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: ALL, label: 'All' },
  { value: 'content', label: 'Content' },
  { value: 'team', label: 'Team' },
  { value: 'news', label: 'Feed corrections' },
];

/** The exact actions the API can filter on, grouped the way the tabs above present them. */
const ACTIONS_BY_CATEGORY: Record<Exclude<CategoryFilter, typeof ALL>, ActivityAction[]> = {
  content: [
    'content.generated',
    'content.refined',
    'content.draft_saved',
    'content.draft_approved',
    'content.draft_dismissed',
  ],
  team: [
    'team.settings_updated',
    'team.member_added',
    'team.member_removed',
    'team.member_role_changed',
  ],
  news: ['news.category_corrected'],
};

const ACTION_LABELS: Record<ActivityAction, string> = {
  'content.generated': 'Content generated',
  'content.refined': 'Content refined',
  'content.draft_saved': 'Draft saved',
  'content.draft_approved': 'Draft approved',
  'content.draft_dismissed': 'Draft dismissed',
  'team.settings_updated': 'Team settings updated',
  'team.member_added': 'Member added',
  'team.member_removed': 'Member removed',
  'team.member_role_changed': 'Member role changed',
  'news.category_corrected': 'Category corrected',
};

const actionCategory = (action: ActivityAction): Exclude<CategoryFilter, typeof ALL> =>
  action.startsWith('content.') ? 'content' : action.startsWith('team.') ? 'team' : 'news';

const CATEGORY_ICON: Record<Exclude<CategoryFilter, typeof ALL>, typeof Sparkles> = {
  content: Sparkles,
  team: Users,
  news: Newspaper,
};

const CATEGORY_VARIANT: Record<Exclude<CategoryFilter, typeof ALL>, 'brand' | 'info' | 'trend'> = {
  content: 'brand',
  team: 'info',
  news: 'trend',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** Groups entries under a day heading so a long history stays scannable. */
function groupByDay(entries: ActivityLogEntryDto[]) {
  const groups: { day: string; label: string; entries: ActivityLogEntryDto[] }[] = [];
  for (const entry of entries) {
    const day = entry.created_at.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.entries.push(entry);
    } else {
      groups.push({ day, label: formatDate(entry.created_at), entries: [entry] });
    }
  }
  return groups;
}

function ActivityRow({ entry }: { entry: ActivityLogEntryDto }) {
  const category = actionCategory(entry.action);
  const Icon = CATEGORY_ICON[category];
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-accent/30">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand-surface">
        <Icon className="size-4 text-brand" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm text-foreground">{entry.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={CATEGORY_VARIANT[category]}>{ACTION_LABELS[entry.action]}</Badge>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar className="size-4">
              <AvatarFallback className="text-[9px]">{initials(entry.actor_name)}</AvatarFallback>
            </Avatar>
            {entry.actor_name}
          </span>
          <span className="text-xs text-muted-foreground">· {timeAgo(entry.created_at)}</span>
        </div>
      </div>
    </li>
  );
}

export default function ActivityLog() {
  const teamId = useTeamId();
  const [category, setCategory] = useState<CategoryFilter>(ALL);
  const [action, setAction] = useState<ActivityAction | typeof ALL>(ALL);
  const [page, setPage] = useState(1);

  // The API filters on one exact action, not a category, so the tabs narrow the action picker and
  // only an explicit action becomes a server-side filter. Everything the tab covers is then
  // matched locally against that same list — no silent mismatch between the two.
  const changeCategory = (value: CategoryFilter) => {
    setCategory(value);
    setAction(ALL);
    setPage(1);
  };
  const changeAction = (value: ActivityAction | typeof ALL) => {
    setAction(value);
    setPage(1);
  };

  const query = useQuery({
    queryKey: ['activity-log', { teamId, action, page }],
    queryFn: () =>
      getActivityLog({
        team_id: teamId as string,
        action: action === ALL ? undefined : action,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(teamId),
  });

  if (!teamId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Activity" icon={History} guideKey="activity" />
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={History}
            title="No team yet"
            description="You need to belong to a team to see its activity."
          />
        </div>
      </div>
    );
  }

  const rawEntries = query.data?.data ?? [];
  const entries =
    category === ALL || action !== ALL
      ? rawEntries
      : rawEntries.filter((entry) => ACTIONS_BY_CATEGORY[category].includes(entry.action));
  const groups = groupByDay(entries);

  const meta = query.data?.meta;
  const hasNextPage = meta ? meta.page < meta.totalPage : false;
  const actionOptions = category === ALL ? [] : ACTIONS_BY_CATEGORY[category];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Activity"
        icon={History}
        guideKey="activity"
        description="Who did what, across content generation, drafts, and team settings."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={category} onValueChange={(value) => changeCategory(value as CategoryFilter)}>
          <TabsList>
            {CATEGORY_FILTERS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {actionOptions.length > 1 && (
          <Select
            value={action}
            onValueChange={(value) => changeAction(value as ActivityAction | typeof ALL)}
          >
            <SelectTrigger size="sm" className="w-[210px]" aria-label="Filter by exact action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Every action in this group</SelectItem>
              {actionOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {ACTION_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {meta && (
          <span className="ml-auto text-xs text-muted-foreground">
            {meta.total.toLocaleString()} events · page {meta.page} of {Math.max(meta.totalPage, 1)}
          </span>
        )}
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[74px] w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="glass-card rounded-xl">
          <ErrorState
            title="Could not load the activity log"
            error={query.error}
            onRetry={() => query.refetch()}
          />
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={History}
            title={page > 1 ? 'Nothing more on this page' : 'No activity yet'}
            description="Generating content, approving drafts, and changing team settings all show up here."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-2">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <ActivityRow key={entry._id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {(page > 1 || hasNextPage) && !query.isLoading && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1 || query.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNextPage || query.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
