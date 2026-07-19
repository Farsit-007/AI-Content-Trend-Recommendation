import { useState } from 'react';
import { Briefcase, Code2, ExternalLink, MessageCircle, Newspaper, PenLine, Server, Shield, Sparkles, Star, ThumbsUp } from 'lucide-react';
import type { NewsItemDto } from '@/lib/api/news';
import { splitNewsTitle } from '@/lib/newsTitle';
import { sourceLogoFor } from '@/lib/sourceLogos';
import { cn } from '@/lib/utils';
import { ScoreMeter } from './ScoreMeter';

interface NewsCardProps {
  item: NewsItemDto;
  onClick: () => void;
  /** Tour-target marker (see `lib/tours.ts`'s `feed` tour) — set on the first rendered card. */
  tourTarget?: string;
}

/** Category-keyed fallback icon for items with no thumbnail_url (design.md decision 7). */
const CATEGORY_ICONS: Record<string, typeof Sparkles> = {
  AI: Sparkles,
  'Web Dev': Code2,
  Career: Briefcase,
  Security: Shield,
  DevOps: Server,
};

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
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const showThumbnail = Boolean(item.thumbnail_url) && !thumbnailFailed;
  const logoFallback = sourceLogoFor(item.source);
  const CategoryIcon = (item.category && CATEGORY_ICONS[item.category]) || Newspaper;
  const { heading, handle } = splitNewsTitle(item.title);
  const bodyText = item.description ?? item.snippet;
  // A split title (GitHub Trending / Product Hunt) already puts the description text in the
  // heading itself — showing it again below would just repeat the same sentence twice.
  const description = handle ? undefined : bodyText;

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
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-white/5">
        {showThumbnail ? (
          <img
            src={item.thumbnail_url}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {/* A source logo is a small mark, never a photo — shown as a centered badge, never
                stretched full-bleed (a tiny favicon blown up to cover the card just reads as a
                blurry blank block). */}
            {logoFallback ? (
              <div className="flex size-11 items-center justify-center rounded-md bg-white p-2 shadow-sm">
                <img src={logoFallback} alt="" loading="lazy" className="size-full object-contain" />
              </div>
            ) : (
              <CategoryIcon className="size-8 text-muted-foreground/40" aria-hidden="true" />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {/* The whole card is a <button> (opens the drawer), so this can't be a nested <a> —
            window.open + stopPropagation gives the same "open original" affordance validly. */}
        <span
          role="link"
          tabIndex={0}
          title={item.url}
          onClick={(e) => {
            e.stopPropagation();
            window.open(item.url, '_blank', 'noopener');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              window.open(item.url, '_blank', 'noopener');
            }
          }}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-medium capitalize hover:border-violet-400/40 hover:text-foreground"
        >
          {item.source.replace(/_/g, ' ')} <ExternalLink className="size-3" aria-label="Open original article" />
        </span>
        <span>{age}</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{heading}</h3>
        {handle && <p className="truncate text-xs text-muted-foreground">{handle}</p>}
      </div>

      {item.category && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-xs text-violet-300">
          {item.category}
          {item.is_overridden && <PenLine className="size-3" aria-label="Category manually overridden" />}
        </span>
      )}

      {description && <p className="line-clamp-3 text-sm text-muted-foreground">{description}</p>}

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
