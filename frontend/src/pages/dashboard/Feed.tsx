import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ExternalLink,
  Inbox,
  LayoutGrid,
  Loader2,
  Newspaper,
  Rows3,
  SearchX,
  Settings2,
} from 'lucide-react';

import { getNewsItems, type NewsItemDto } from '@/lib/api/news';
import { DEFAULT_FEED_SORT } from '@/lib/constants';
import { useTeamId } from '@/lib/useTeamId';
import { timeAgo } from '@/lib/datetime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeedControls } from '@/components/feed/FeedControls';
import { NewsCard } from '@/components/feed/NewsCard';
import { NewsItemDialog } from '@/components/feed/NewsItemDialog';
import { PageHeader } from '@/components/dashboard/PageHeader';

const PAGE_SIZE = 15;
const VIEW_STORAGE_KEY = 'growth-studio:feed-view';

type FeedView = 'grid' | 'table';

/** Remembering the view per browser is a convenience, not state anything else depends on. */
function readStoredView(): FeedView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid';
  }
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="glass-card flex flex-col rounded-2xl p-0">
          <Skeleton className="mx-4 mt-4 size-8 rounded-full" />
          <Skeleton className="mx-4 mt-2 h-4 w-11/12" />
          <Skeleton className="mx-4 mt-1.5 h-4 w-3/5" />
          <Skeleton className="mx-4 mt-2 h-3 w-16" />
          <Skeleton className="mx-4 mt-1 h-3 w-28" />
          <Skeleton className="mx-1 mt-3 aspect-video rounded-xl" />
          <div className="mx-4 flex h-11 items-center">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Feed() {
  const teamId = useTeamId();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState(DEFAULT_FEED_SORT);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [view, setView] = useState<FeedView>(readStoredView);

  const hasActiveFilters = Boolean(category || searchTerm);

  const changeView = (next: FeedView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // A browser with site data blocked still gets a working toggle, just not a sticky one.
    }
  };

  // Changing any filter changes the queryKey, so react-query naturally restarts at
  // initialPageParam (1) and drops previously-accumulated pages — no manual reset needed.
  const query = useInfiniteQuery({
    queryKey: ['news', { category, sort, searchTerm, teamId }],
    queryFn: ({ pageParam }) =>
      getNewsItems({
        category,
        sort,
        searchTerm: searchTerm || undefined,
        page: pageParam,
        limit: PAGE_SIZE,
        team_id: teamId,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const meta = lastPage.meta;
      if (!meta || meta.page >= meta.totalPage) return undefined;
      return meta.page + 1;
    },
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  const isFirstLoad = query.isLoading;
  // team_ready is only ever sent when a team context resolved; absence means "not applicable"
  // (unauthenticated/no-team caller), not "not ready" — only an explicit `false` triggers the banner.
  const teamNotReady = query.data?.pages[0]?.team_ready === false;

  const columns = useMemo<DataTableColumn<NewsItemDto>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Story',
        sortFn: 'text',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 font-medium">{row.original.title}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {row.original.source}
              {row.original.high_opportunity && <Badge variant="opportunity">Opportunity</Badge>}
              {row.original.is_overridden && <Badge variant="outline">Team override</Badge>}
              {row.original.match_reason === 'semantic' && (
                <Badge variant="outline">Nearly relevant</Badge>
              )}
            </span>
          </div>
        ),
      },
      {
        id: 'category',
        accessorKey: 'category',
        header: 'Category',
        sortFn: 'text',
        cell: ({ row }) =>
          row.original.category ? (
            <Badge variant="brand">{row.original.category}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'trend_score',
        accessorKey: 'trend_score',
        header: 'Trend',
        sortFn: 'basic',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) => (row.original.trend_score ?? 0).toFixed(1),
      },
      {
        id: 'opportunity_score',
        accessorKey: 'opportunity_score',
        header: 'Opportunity',
        sortFn: 'basic',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) =>
          typeof row.original.opportunity_score === 'number' ? (
            <span className={row.original.high_opportunity ? 'text-opportunity' : undefined}>
              {row.original.opportunity_score.toFixed(1)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'published_at',
        accessorKey: 'published_at',
        header: 'Published',
        sortFn: 'datetime',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {timeAgo(row.original.published_at ?? row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        meta: { className: 'w-0', label: 'Actions' },
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            aria-label="Open the original source"
            onClick={(event) => event.stopPropagation()}
          >
            <a href={row.original.url} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ),
      },
    ],
    [],
  );

  const loadMore = query.hasNextPage ? (
    <div className="flex justify-center">
      <Button
        variant="outline"
        onClick={() => query.fetchNextPage()}
        disabled={query.isFetchingNextPage}
        className="gap-2"
      >
        {query.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
        Load more
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Feed"
        icon={Newspaper}
        guideKey="feed"
        description="Everything ingested for the categories your team subscribes to, scored for trend and opportunity."
        actions={
          <Tabs value={view} onValueChange={(value) => changeView(value as FeedView)}>
            <TabsList>
              <TabsTrigger value="grid" aria-label="Card view">
                <LayoutGrid />
                <span className="hidden sm:inline">Cards</span>
              </TabsTrigger>
              <TabsTrigger value="table" aria-label="Table view">
                <Rows3 />
                <span className="hidden sm:inline">Table</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div data-tour="feed-controls">
        <FeedControls
          category={category}
          onCategoryChange={setCategory}
          sort={sort}
          onSortChange={setSort}
          onSearchChange={setSearchTerm}
        />
      </div>

      {isFirstLoad ? (
        <SkeletonGrid />
      ) : query.isError ? (
        <div className="glass-card rounded-xl">
          <ErrorState
            title="Could not load the feed"
            error={query.error}
            onRetry={() => query.refetch()}
          />
        </div>
      ) : teamNotReady ? (
        <div className="glass-card flex flex-col items-center gap-3 rounded-xl p-8 text-center">
          <Settings2 className="size-6 text-brand" />
          <p className="font-medium text-foreground">Complete your team setup</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Subscribe to at least one category and add a brand-voice example in Team Settings so
            your feed can be curated to what your team actually cares about.
          </p>
          <Button asChild size="sm" className="btn-glow gap-1.5">
            <Link to="/dashboard/settings/team">
              Go to Team Settings <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card rounded-xl">
          {hasActiveFilters ? (
            <EmptyState
              icon={SearchX}
              title="No items match these filters"
              description="Widen the category, clear the search, or try a different sort."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCategory(undefined);
                    setSearchTerm('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="Nothing has been ingested yet"
              description="The pipeline fills this automatically — an admin can also force a run from the Pipeline page."
            />
          )}
        </div>
      ) : view === 'table' ? (
        <>
          <section className="glass-card rounded-xl p-5">
            <DataTable
              data={items}
              columns={columns}
              getRowId={(row) => row._id}
              isFetching={query.isFetching && !query.isFetchingNextPage}
              minWidth={880}
              hidePagination
              onRowClick={(row) => setSelectedItemId(row._id)}
              renderMobileCard={(row) => (
                <div className="flex flex-col gap-1.5">
                  <p className="line-clamp-2 font-medium">{row.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{row.source}</span>
                    {row.category && <Badge variant="brand">{row.category}</Badge>}
                    <span className="tabular-nums">trend {(row.trend_score ?? 0).toFixed(1)}</span>
                  </div>
                </div>
              )}
            />
          </section>
          {loadMore}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item, i) => (
              <NewsCard
                key={item._id}
                item={item}
                onClick={() => setSelectedItemId(item._id)}
                tourTarget={i === 0 ? 'feed-card' : undefined}
              />
            ))}
          </div>
          {loadMore}
        </>
      )}

      <NewsItemDialog
        newsItemId={selectedItemId}
        onOpenChange={(open) => !open && setSelectedItemId(null)}
      />
    </div>
  );
}
