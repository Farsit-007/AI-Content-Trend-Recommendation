import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { addCustomCategory, removeCustomCategory } from '@/lib/api/teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CustomCategoriesSectionProps {
  teamId: string;
  customCategories: string[];
}

/** Custom categories are the pool available when correcting a news item's category for your
 *  team (Feed drawer) — distinct from `subscribed_categories`, which stays limited to the
 *  fixed built-in taxonomy server-side. Open to any team member, not admin-gated. */
export function CustomCategoriesSection({ teamId, customCategories }: CustomCategoriesSectionProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['team', teamId] });

  const addMutation = useMutation({
    mutationFn: (category: string) => addCustomCategory(teamId, category),
    onSuccess: () => {
      toast.success('Category added');
      setDraft('');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add category'),
  });

  const removeMutation = useMutation({
    mutationFn: (category: string) => removeCustomCategory(teamId, category),
    onSuccess: () => {
      toast.success('Category removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove category'),
  });

  const handleAdd = () => {
    if (!draft.trim()) return;
    addMutation.mutate(draft.trim());
  };

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Custom categories</h2>
        <p className="text-sm text-muted-foreground">
          Beyond the built-in taxonomy — available when correcting a story's category for your team on the
          Feed. Any team member can manage these.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {customCategories.length === 0 && (
          <p className="text-sm text-muted-foreground">No custom categories yet.</p>
        )}
        {customCategories.map((category) => (
          <span
            key={category}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs"
          >
            {category}
            <button
              type="button"
              onClick={() => removeMutation.mutate(category)}
              disabled={removeMutation.isPending && removeMutation.variables === category}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Fintech"
          className="w-48"
        />
        <Button type="button" size="sm" variant="outline" disabled={!draft.trim() || addMutation.isPending} onClick={handleAdd} className="gap-1.5">
          {addMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add
        </Button>
      </div>
    </section>
  );
}
