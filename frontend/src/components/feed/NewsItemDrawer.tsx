import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ExternalLink, Loader2, PenLine, RotateCcw, Sparkles } from 'lucide-react';
import { clearNewsItemOverride, getNewsItem, setNewsItemOverride, type NewsItemDto } from '@/lib/api/news';
import { getTeamCategories } from '@/lib/api/teams';
import { useTeamId } from '@/lib/useTeamId';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScoreMeter } from './ScoreMeter';

interface NewsItemDrawerProps {
  newsItemId: string | null;
  onOpenChange: (open: boolean) => void;
}

interface OverrideControlsProps {
  item: NewsItemDto;
  teamId: string;
}

/** Keyed by `item._id` from the parent, so switching items remounts this with fresh draft
 *  state instead of needing an effect to resync it. */
function OverrideControls({ item, teamId }: OverrideControlsProps) {
  const queryClient = useQueryClient();
  const [correcting, setCorrecting] = useState(false);
  const [draftCategory, setDraftCategory] = useState(item.category ?? '');
  const [draftScore, setDraftScore] = useState(
    typeof item.opportunity_score === 'number' ? String(item.opportunity_score) : '',
  );

  const categoriesQuery = useQuery({
    queryKey: ['team-categories', teamId],
    queryFn: () => getTeamCategories(teamId),
    enabled: correcting,
  });

  const invalidateFeed = () => {
    queryClient.invalidateQueries({ queryKey: ['news'] });
    queryClient.invalidateQueries({ queryKey: ['news-item', item._id] });
  };

  const saveOverrideMutation = useMutation({
    mutationFn: () =>
      setNewsItemOverride(item._id, {
        team_id: teamId,
        category: draftCategory || undefined,
        opportunity_score: draftScore ? Number(draftScore) : undefined,
      }),
    onSuccess: () => {
      toast.success('Corrected — this only changes what your team sees');
      setCorrecting(false);
      invalidateFeed();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save correction'),
  });

  const clearOverrideMutation = useMutation({
    mutationFn: () => clearNewsItemOverride(item._id, teamId),
    onSuccess: () => {
      toast.success('Reverted to the shared value');
      invalidateFeed();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to clear correction'),
  });

  return (
    <div className="rounded-lg border border-white/10 p-3">
      {!correcting ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Category or score look wrong for your team? This only changes what your team sees — the shared
            record stays the same for everyone else.
          </p>
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setCorrecting(true)}>
              <PenLine className="size-3.5" /> Correct
            </Button>
            {item.is_overridden && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5"
                disabled={clearOverrideMutation.isPending}
                onClick={() => clearOverrideMutation.mutate()}
              >
                <RotateCcw className="size-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Correct for your team</p>
          <select
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value)}
            disabled={categoriesQuery.isLoading}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {(categoriesQuery.data ?? (item.category ? [item.category] : [])).map((c) => (
              <option key={c} value={c} className="bg-background text-foreground">
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={draftScore}
            onChange={(e) => setDraftScore(e.target.value)}
            placeholder="Opportunity score (0–10)"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              disabled={saveOverrideMutation.isPending}
              onClick={() => saveOverrideMutation.mutate()}
              className="gap-1.5 bg-violet-600 hover:bg-violet-500"
            >
              {saveOverrideMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Save correction
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCorrecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NewsItemDrawer({ newsItemId, onOpenChange }: NewsItemDrawerProps) {
  const navigate = useNavigate();
  const teamId = useTeamId();
  const open = newsItemId !== null;

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['news-item', newsItemId],
    queryFn: () => getNewsItem(newsItemId as string),
    enabled: open,
  });

  const handleGenerate = () => {
    if (!item) return;
    navigate('/dashboard/generate', { state: { newsItemId: item._id, topic: item.title } });
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {isLoading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}

        {isError && (
          <div className="flex flex-1 items-center justify-center p-4 text-sm text-red-400">
            Couldn't load this item.
          </div>
        )}

        {item && (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg leading-snug">{item.title}</SheetTitle>
              <SheetDescription>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-violet-300 hover:underline"
                >
                  {item.source.replace(/_/g, ' ')} <ExternalLink className="size-3" />
                </a>
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.category && (
                  <span className="inline-flex w-fit items-center rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-xs text-violet-300">
                    {item.category}
                  </span>
                )}
                {item.is_overridden && (
                  <span className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-400">
                    Corrected by your team
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <ScoreMeter label="Trend" value={item.trend_score} variant="amber" />
                {typeof item.opportunity_score === 'number' && (
                  <ScoreMeter label="Opportunity" value={item.opportunity_score} variant="emerald" />
                )}
              </div>

              {teamId && <OverrideControls key={item._id} item={item} teamId={teamId} />}

              {item.impact_note && (
                <div className="glass-card rounded-lg p-3 text-sm">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Why it matters</p>
                  <p>{item.impact_note}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {item.content ? 'Full content' : 'Snippet'}
                </p>
                <p className="max-h-72 overflow-y-auto text-sm whitespace-pre-wrap text-foreground/90">
                  {item.content ?? item.snippet ?? 'No preview available.'}
                </p>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2 p-4">
              <Button onClick={handleGenerate} className="btn-glow gap-2 bg-violet-600 hover:bg-violet-500">
                <Sparkles className="size-4" /> Generate content
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
