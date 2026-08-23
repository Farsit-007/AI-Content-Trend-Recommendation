import { useEffect, useState } from 'react';
import { ChevronsUpDown, Search } from 'lucide-react';
import { FEED_SORT_OPTIONS, NEWS_CATEGORIES } from '@/lib/constants';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ALL_TAB = 'All';

interface FeedControlsProps {
  category: string | undefined;
  onCategoryChange: (category: string | undefined) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  onSearchChange: (searchTerm: string) => void;
}

export function FeedControls({ category, onCategoryChange, sort, onSortChange, onSearchChange }: FeedControlsProps) {
  const [rawSearch, setRawSearch] = useState('');
  const debouncedSearch = useDebouncedValue(rawSearch, 300);
  const activeSort = FEED_SORT_OPTIONS.find((option) => option.value === sort);

  useEffect(() => {
    onSearchChange(debouncedSearch.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return (
    <div className="glass-card sticky top-0 z-10 flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5">
        {[ALL_TAB, ...NEWS_CATEGORIES].map((tab) => {
          const isActive = tab === ALL_TAB ? category === undefined : category === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onCategoryChange(tab === ALL_TAB ? undefined : tab)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                isActive
                  ? 'border-violet-500/60 bg-violet-500/15 text-brand dark:border-violet-400/50 dark:bg-violet-400/15'
                  : 'border-border text-muted-foreground hover:border-violet-500/40 hover:text-foreground',
              )}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Search the feed…"
            className="w-full pl-8 sm:w-48"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-36 justify-between gap-1.5 font-normal">
              <span className="truncate">{activeSort?.label ?? 'Sort'}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={onSortChange}>
              {FEED_SORT_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
