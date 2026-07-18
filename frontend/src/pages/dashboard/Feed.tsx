import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertTriangle, Inbox, Loader2, SearchX } from 'lucide-react';
import { getNewsItems } from '@/lib/api/news';
import { DEFAULT_FEED_SORT } from '@/lib/constants';
import { useTeamId } from '@/lib/useTeamId';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FeedControls } from '@/components/feed/FeedControls';
import { NewsCard } from '@/components/feed/NewsCard';
import { NewsItemDrawer } from '@/components/feed/NewsItemDrawer';

const PAGE_SIZE = 15;

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass-card flex flex-col gap-3 rounded-xl p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-3 w-full" />
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Feed</h1>

      <FeedControls
        category={category}
        onCategoryChange={setCategory}
        sort={sort}
        onSortChange={setSort}
        onSearchChange={setSearchTerm}
      />

      {isFirstLoad ? (
        <SkeletonGrid />
      ) : query.isError ? (
        <div className="glass-card flex flex-col items-center gap-3 rounded-xl p-8 text-center">
          <AlertTriangle className="size-6 text-red-400" />
          <p className="text-sm text-muted-foreground">Couldn't load the feed.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Retry
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <NewsCard key={item._id} item={item} onClick={() => setSelectedItemId(item._id)} />
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

      <NewsItemDrawer newsItemId={selectedItemId} onOpenChange={(open) => !open && setSelectedItemId(null)} />
    </div>
  );
}
