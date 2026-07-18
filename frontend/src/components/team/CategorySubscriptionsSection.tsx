import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CategorySubscriptionsSectionProps {
  subscribed: string[];
  /** Full effective category list — fixed six + everything discovered during ingestion + this
   *  team's own custom categories (`GET /teams/:id/categories`). No longer a hardcoded fixed six —
   *  see flexible-news-taxonomy-and-relevance. */
  categories: string[];
  isAdmin: boolean;
  isSaving: boolean;
  onSave: (categories: string[]) => void;
}

export function CategorySubscriptionsSection({
  subscribed,
  categories,
  isAdmin,
  isSaving,
  onSave,
}: CategorySubscriptionsSectionProps) {
  // The parent remounts this component (via `key`) whenever `subscribed` changes underneath it
  // after a save, so this only ever needs to seed its initial draft — no resync effect needed.
  const [selected, setSelected] = useState<string[]>(subscribed);
  const [search, setSearch] = useState('');

  const toggle = (category: string) => {
    setSelected((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  };

  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...subscribed].sort());

  // Selected categories always stay visible even while a search term hides everything else, so
  // toggling one off doesn't require first clearing the filter — a growing taxonomy (beyond the
  // old fixed six) makes a plain unfiltered grid unwieldy once a team has many discovered
  // categories available.
  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return categories;
    return categories.filter((c) => c.toLowerCase().includes(term) || selected.includes(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, search]);

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Category subscriptions</h2>
        <p className="text-sm text-muted-foreground">
          {selected.length === 0
            ? 'No categories selected — the feed currently includes all categories.'
            : 'The feed is narrowed to the categories checked below (including any more specific category under a checked group).'}
        </p>
      </div>

      {categories.length > 12 && (
        <div className="relative w-full max-w-64">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="pl-8"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visibleCategories.map((category) => (
          <label
            key={category}
            className={cn(
              'flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm',
              !isAdmin && 'opacity-60',
            )}
          >
            <input
              type="checkbox"
              checked={selected.includes(category)}
              disabled={!isAdmin}
              onChange={() => toggle(category)}
              className="size-4 rounded border-input accent-violet-600"
            />
            {category}
          </label>
        ))}
        {visibleCategories.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No categories match "{search}".</p>
        )}
      </div>

      {isAdmin ? (
        <Button
          type="button"
          disabled={!dirty || isSaving}
          onClick={() => onSave(selected)}
          variant="outline"
          className="w-fit"
        >
          {isSaving ? 'Saving…' : 'Save subscriptions'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Ask a team admin to change this.</p>
      )}
    </section>
  );
}
