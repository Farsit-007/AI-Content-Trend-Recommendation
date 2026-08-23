import { useState } from 'react';
import { Bookmark, BookmarkPlus, X } from 'lucide-react';

import { deleteSavedView, loadSavedViews, saveView, type SavedView } from '@/lib/savedViews';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SavedViewsProps {
  userId: string;
  /** The filter state a "save" would capture. */
  current: { category?: string; sort: string; searchTerm?: string };
  onApply: (view: SavedView) => void;
  /** Highlights the chip matching what is on screen, so the active view is obvious. */
  activeId?: string;
}

/**
 * Save the current filter+sort as a named view, and switch between saved ones.
 *
 * The feed has category, sort and search, which is enough combinations that people re-derive the
 * same two or three every day. This makes those one click.
 *
 * State is held locally rather than lifted: nothing else on the page needs the list, and reading it
 * from `localStorage` on mount keeps the single source of truth in one place.
 */
export function SavedViews({ userId, current, onApply, activeId }: SavedViewsProps) {
  const [views, setViews] = useState<SavedView[]>(() => loadSavedViews(userId));
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setViews(saveView(userId, { ...current, name: trimmed }));
    setName('');
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((view) => (
        <span
          key={view.id}
          className={cn(
            'group/view inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition',
            view.id === activeId
              ? 'border-violet-400/60 bg-violet-400/10 text-violet-300'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <button
            type="button"
            onClick={() => onApply(view)}
            className="inline-flex items-center gap-1"
          >
            <Bookmark className="size-3" aria-hidden />
            {view.name}
          </button>
          <button
            type="button"
            onClick={() => setViews(deleteSavedView(userId, view.id))}
            aria-label={`Delete the "${view.name}" view`}
            className="rounded-full opacity-0 transition group-hover/view:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs">
            <BookmarkPlus className="size-3.5" />
            Save view
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="flex flex-col gap-2">
            <label htmlFor="saved-view-name" className="text-xs font-medium">
              Name this view
            </label>
            <Input
              id="saved-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
              placeholder="e.g. Hot AI stories"
            />
            <p className="text-xs text-muted-foreground">
              Saves the current category, sort, and search. Stored in this browser only.
            </p>
            <Button size="sm" onClick={commit} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
