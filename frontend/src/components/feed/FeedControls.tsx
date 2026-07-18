import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { FEED_SORT_OPTIONS, NEWS_CATEGORIES } from '@/lib/constants';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

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
                  ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                  : 'border-white/10 text-muted-foreground hover:text-foreground',
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

        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {FEED_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-background text-foreground">
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
