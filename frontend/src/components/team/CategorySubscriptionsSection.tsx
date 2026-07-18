import { useState } from 'react';
import { NEWS_CATEGORIES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CategorySubscriptionsSectionProps {
  subscribed: string[];
  isAdmin: boolean;
  isSaving: boolean;
  onSave: (categories: string[]) => void;
}

export function CategorySubscriptionsSection({
  subscribed,
  isAdmin,
  isSaving,
  onSave,
}: CategorySubscriptionsSectionProps) {
  // The parent remounts this component (via `key`) whenever `subscribed` changes underneath it
  // after a save, so this only ever needs to seed its initial draft — no resync effect needed.
  const [selected, setSelected] = useState<string[]>(subscribed);

  const toggle = (category: string) => {
    setSelected((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  };

  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...subscribed].sort());

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Category subscriptions</h2>
        <p className="text-sm text-muted-foreground">
          {selected.length === 0
            ? 'No categories selected — the feed currently includes all categories.'
            : 'The feed is narrowed to the categories checked below.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {NEWS_CATEGORIES.map((category) => (
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
