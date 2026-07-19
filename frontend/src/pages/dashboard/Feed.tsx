import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Inbox, Loader2, SearchX, Settings2 } from 'lucide-react';
import { getNewsItems } from '@/lib/api/news';
import { DEFAULT_FEED_SORT } from '@/lib/constants';
import { useTeamId } from '@/lib/useTeamId';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FeedControls } from '@/components/feed/FeedControls';
import { NewsCard } from '@/components/feed/NewsCard';
import { NewsItemDialog } from '@/components/feed/NewsItemDialog';
import { PageHelp } from '@/components/dashboard/PageHelp';

const PAGE_SIZE = 15;

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

  const hasActiveFilters = Boolean(category || searchTerm);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Feed</h1>
        <PageHelp guideKey="feed" />
      </div>

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
        <div className="glass-card flex flex-col items-center gap-3 rounded-xl p-8 text-center">
          <AlertTriangle className="size-6 text-red-500 dark:text-red-400" />
          <p className="text-sm text-muted-foreground">Couldn't load the feed.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : teamNotReady ? (
        <div className="glass-card flex flex-col items-center gap-3 rounded-xl p-8 text-center">
          <Settings2 className="size-6 text-violet-700 dark:text-violet-300" />
          <p className="font-medium text-foreground">Complete your team setup</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Subscribe to at least one category and add a brand-voice example in Team Settings so your feed can be
            curated to what your team actually cares about.
          </p>
          <Button asChild size="sm" className="btn-glow gap-1.5">
            <Link to="/dashboard/settings/team">
              Go to Team Settings <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 rounded-xl p-8 text-center">
          {hasActiveFilters ? (
            <>
              <SearchX className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No items match these filters.</p>
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
            </>
          ) : (
            <>
              <Inbox className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nothing has been ingested yet.</p>
            </>
          )}
        </div>
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

          {query.hasNextPage && (
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
          )}
        </>
      )}

      <NewsItemDialog newsItemId={selectedItemId} onOpenChange={(open) => !open && setSelectedItemId(null)} />
    </div>
  );
}
