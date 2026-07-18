import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { getNewsItem } from '@/lib/api/news';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScoreMeter } from './ScoreMeter';

interface NewsItemDrawerProps {
  newsItemId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function NewsItemDrawer({ newsItemId, onOpenChange }: NewsItemDrawerProps) {
  const navigate = useNavigate();
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
              {item.category && (
                <span className="inline-flex w-fit items-center rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-xs text-violet-300">
                  {item.category}
                </span>
              )}

              <div className="flex flex-col gap-1.5">
                <ScoreMeter label="Trend" value={item.trend_score} variant="amber" />
                {typeof item.opportunity_score === 'number' && (
                  <ScoreMeter label="Opportunity" value={item.opportunity_score} variant="emerald" />
                )}
              </div>

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
