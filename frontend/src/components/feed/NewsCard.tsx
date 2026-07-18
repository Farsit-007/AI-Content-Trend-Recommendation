import { MessageCircle, PenLine, Star, ThumbsUp } from 'lucide-react';
import type { NewsItemDto } from '@/lib/api/news';
import { cn } from '@/lib/utils';
import { ScoreMeter } from './ScoreMeter';

interface NewsCardProps {
  item: NewsItemDto;
  onClick: () => void;
  /** Tour-target marker (see `lib/tours.ts`'s `feed` tour) — set on the first rendered card. */
  tourTarget?: string;
}

/** Small, dependency-free "3 hours ago" / "2 days ago" formatter. */
function formatRelativeAge(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(deltaMinutes) < 60) return rtf.format(-deltaMinutes, 'minute');
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return rtf.format(-deltaHours, 'hour');
  const deltaDays = Math.round(deltaHours / 24);
  return rtf.format(-deltaDays, 'day');
}

export function NewsCard({ item, onClick, tourTarget }: NewsCardProps) {
  const age = formatRelativeAge(item.published_at ?? item.created_at);

  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={tourTarget}
      className={cn(
        'glass-card flex h-full flex-col gap-3 rounded-xl p-4 text-left transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
        item.high_opportunity && 'border-emerald-400/50 bg-emerald-400/5 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-medium capitalize">
          {item.source.replace(/_/g, ' ')}
        </span>
        <span>{age}</span>
      </div>

      <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</h3>

      {item.category && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-xs text-violet-300">
          {item.category}
          {item.is_overridden && <PenLine className="size-3" aria-label="Category manually overridden" />}
        </span>
      )}

      {item.snippet && <p className="line-clamp-3 text-sm text-muted-foreground">{item.snippet}</p>}

      <div className="mt-auto flex flex-col gap-1.5 pt-1">
        <ScoreMeter label="Trend" value={item.trend_score} variant="amber" />
        {typeof item.opportunity_score === 'number' && (
          <ScoreMeter label="Opportunity" value={item.opportunity_score} variant="emerald" />
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="size-3.5" /> {item.engagement.points}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-3.5" /> {item.engagement.comments}
        </span>
        <span className="inline-flex items-center gap-1">
          <Star className="size-3.5" /> {item.engagement.stars_delta}
        </span>
      </div>
    </button>
  );
}
