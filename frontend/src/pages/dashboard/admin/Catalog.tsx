import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Database, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createNewsItem,
  deleteNewsItem,
  getNewsItems,
  updateNewsItem,
  type NewsItemDto,
} from '@/lib/api/news';
import { NEWS_CATEGORIES } from '@/lib/constants';
import { useTour } from '@/context/tour-context';
import { PAGE_TOURS } from '@/lib/tours';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHelp } from '@/components/dashboard/PageHelp';

function EditRow({ item }: { item: NewsItemDto }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url);
  const [category, setCategory] = useState(item.category ?? '');
  const [trendScore, setTrendScore] = useState(String(item.trend_score ?? 0));
  const [opportunityScore, setOpportunityScore] = useState(String(item.opportunity_score ?? ''));
  const [impactNote, setImpactNote] = useState(item.impact_note ?? '');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['catalog'] });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateNewsItem(item._id, {
        title: title.trim(),
        url: url.trim(),
        category: category || undefined,
        trend_score: trendScore ? Number(trendScore) : undefined,
        opportunity_score: opportunityScore ? Number(opportunityScore) : undefined,
        impact_note: impactNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Saved — this is the shared record every team sees');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNewsItem(item._id),
    onSuccess: () => {
      toast.success('Deleted');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Delete failed'),
  });

  return (
    <div className="glass-card flex flex-col rounded-xl">
      <div className="flex w-full items-start justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <p className="truncate font-medium text-foreground">{item.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-white/10 px-2 py-0.5">{item.source}</span>
            {item.category && <span className="rounded-full border border-violet-400/30 px-2 py-0.5 text-violet-300">{item.category}</span>}
            <span>trend {item.trend_score?.toFixed(1)}</span>
            {typeof item.opportunity_score === 'number' && <span>opportunity {item.opportunity_score.toFixed(1)}</span>}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (window.confirm(`Delete "${item.title}" for every team? This can't be undone.`)) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
          </Button>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="p-1">
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-white/10 p-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="" className="bg-background text-foreground">
                No category
              </option>
              {NEWS_CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-background text-foreground">
                  {c}
                </option>
              ))}
            </select>
            <Input value={trendScore} onChange={(e) => setTrendScore(e.target.value)} placeholder="Trend score" type="number" step="0.1" />
            <Input
              value={opportunityScore}
              onChange={(e) => setOpportunityScore(e.target.value)}
              placeholder="Opportunity score"
              type="number"
              step="0.1"
            />
          </div>
          <textarea
            value={impactNote}
            onChange={(e) => setImpactNote(e.target.value)}
            placeholder="Why it matters (impact note)"
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Button
            type="button"
            variant="outline"
            className="w-fit gap-1.5"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminCatalog() {
  const queryClient = useQueryClient();
  const { startTour } = useTour();
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [snippet, setSnippet] = useState('');
  const [category, setCategory] = useState('');

  const catalogQuery = useQuery({
    queryKey: ['catalog', search],
    queryFn: () => getNewsItems({ sort: '-created_at', searchTerm: search || undefined, limit: 30 }),
  });
  const items = catalogQuery.data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: createNewsItem,
    onSuccess: () => {
      toast.success('Added to the catalog');
      setTitle('');
      setUrl('');
      setSnippet('');
      setCategory('');
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add item'),
  });

  const handleCreate = () => {
    if (!title.trim() || !url.trim()) {
      toast.error('Title and URL are required');
      return;
    }
    const uniqueSuffix = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createMutation.mutate({
      source: 'manual',
      source_id: uniqueSuffix,
      content_hash: uniqueSuffix,
      title: title.trim(),
      url: url.trim(),
      snippet: snippet.trim() || undefined,
      category: category || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            News <span className="gradient-text">catalog</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            The shared record every team sees. Backfill a story the pipeline missed, or correct/remove one —
            changes here are global, not per-team (that's what an override on the Feed does instead).
          </p>
        </div>
        <PageHelp guideKey="catalog" onStartTour={() => startTour(PAGE_TOURS.catalog)} />
      </div>

      <section data-tour="catalog-create" className="glass-card flex flex-col gap-4 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-violet-300" />
          <h2 className="font-semibold">Backfill a story</h2>
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <textarea
          value={snippet}
          onChange={(e) => setSnippet(e.target.value)}
          placeholder="Snippet / summary (optional)"
          rows={2}
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 w-fit rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="" className="bg-background text-foreground">
            No category
          </option>
          {NEWS_CATEGORIES.map((c) => (
            <option key={c} value={c} className="bg-background text-foreground">
              {c}
            </option>
          ))}
        </select>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="btn-glow w-fit gap-2 bg-violet-600 hover:bg-violet-500"
        >
          {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Add to catalog
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-violet-300" />
            <h2 className="font-semibold">Recent items</h2>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the catalog…"
            className="w-56"
          />
        </div>

        {catalogQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <EditRow key={item._id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
