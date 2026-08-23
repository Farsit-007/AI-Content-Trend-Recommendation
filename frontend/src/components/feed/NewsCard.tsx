import { useState } from 'react';
import {
  Briefcase,
  Code2,
  ExternalLink,
  Flame,
  MessageCircle,
  Newspaper,
  PenLine,
  Server,
  Shield,
  Sparkles,
  Star,
  Target,
  ThumbsUp,
} from 'lucide-react';
import type { NewsItemDto } from '@/lib/api/news';
import { splitNewsTitle } from '@/lib/newsTitle';
import { isSourceLogoUrl, sourceLogoFor } from '@/lib/sourceLogos';
import { cn } from '@/lib/utils';
import { ScorePill } from './ScorePill';
import { Stat } from './Stat';

/**
 * How the opportunity score for an item was arrived at. Short labels, because this sits in a dense
 * metadata row — the full explanation is the tooltip.
 */
const SCORE_SOURCE_LABEL: Record<'override' | 'team' | 'baseline', string> = {
  override: 'set by hand',
  team: 'your voice',
  baseline: 'platform avg',
};

const SCORE_SOURCE_HINT: Record<'override' | 'team' | 'baseline', string> = {
  override: 'Someone on your team set this score manually.',
  team: "Scored against your team's own brand-voice examples.",
  baseline:
    'Platform-wide fallback — your team has no brand-voice examples yet, so this is measured against every team pooled together. Add examples in Team Settings for a score that reflects you.',
};


interface NewsCardProps {
  item: NewsItemDto;
  onClick: () => void;
  /** Tour-target marker (see `lib/tours.ts`'s `feed` tour) — set on the first rendered card. */
  tourTarget?: string;
}

/** Anything narrower than this is a mark (favicon, sprite, tracking pixel) rather than a photo —
 *  a real cover image from any source we ingest is comfortably wider. */
const MIN_COVER_WIDTH = 240;

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
  // Set when the loaded image turns out to be too small to be cover art — see `isCoverArt`.
  const [thumbnailIsTiny, setThumbnailIsTiny] = useState(false);
  const logo = sourceLogoFor(item.source);
  const CategoryIcon = (item.category && CATEGORY_ICONS[item.category]) || Newspaper;
  const { heading, handle } = splitNewsTitle(item.title);

  const hasThumbnail = Boolean(item.thumbnail_url) && !thumbnailFailed;
  // metaEnrichment backfills `thumbnail_url` with the source favicon when it can't find a real
  // image, so plenty of items carry a 16px .ico in the field the cover would otherwise stretch
  // edge-to-edge as a blurry smear. Only genuine photos get `object-cover`.
  const isCoverArt = hasThumbnail && !isSourceLogoUrl(item.thumbnail_url) && !thumbnailIsTiny;
  const badgeLogo = hasThumbnail ? item.thumbnail_url : logo;

  const { points, comments, stars_delta: starsDelta } = item.engagement;
  const hasEngagement = Boolean(points || comments || starsDelta);

  return (
    // Structure mirrors daily.dev's ArticleGrid card (dailydotdev/apps,
    // packages/shared/src/components/cards/article/ArticleGrid.tsx): the root carries no padding,
    // text rows are inset by mx-4, and the cover image is near-full-bleed at mx-1. A flex-1
    // spacer (their CardSpace) pins the image and action bar to the bottom so titles of
    // different lengths still line up across a row.
    //
    // The card can't be a <button> — it contains its own links, and nesting interactive elements
    // is invalid HTML. Instead an overlay button sits behind the content (their CardOverlay);
    // content is pointer-events-none so clicks fall through to it, and the bits that need their
    // own click re-enable it.
    <article
      data-tour={tourTarget}
      className={cn(
        'glass-card group relative flex h-full flex-col rounded-2xl p-0 transition duration-200',
        'hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5 dark:hover:border-violet-400/40',
        'focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/40',
        item.high_opportunity && 'border-emerald-500/50 bg-emerald-500/[0.06] dark:border-emerald-400/50',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none"
        aria-label={`Open ${heading}`}
      />

      {/* Header — avatar only, no source name, matching PostCardHeader. */}
      <div className="pointer-events-none relative z-10 mx-4 mt-4 flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border">
          {logo ? (
            <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-4.5 object-contain" />
          ) : (
            <CategoryIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          title={item.url}
          className="pointer-events-auto ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
        >
          <ExternalLink className="size-4" />
          <span className="sr-only">Open original article</span>
        </a>
      </div>

      {/* Title — their CardTitle: mt-2, font-bold, typo-title3 (~17px), line-clamp-3. */}
      <h3 className="pointer-events-none relative z-10 mx-4 mt-2 line-clamp-3 text-[17px] leading-snug font-bold break-words text-foreground">
        {heading}
      </h3>
      {handle && (
        <p className="pointer-events-none relative z-10 mx-4 mt-0.5 truncate text-xs text-muted-foreground">{handle}</p>
      )}

      {/* Tags row — their PostTags renders #hashtags. */}
      {item.category && (
        <div className="pointer-events-none relative z-10 mx-4 mt-2 flex items-center gap-1 text-xs font-medium text-brand">
          <span>#{item.category.replace(/\s+/g, '')}</span>
          {item.is_overridden && <PenLine className="size-3" aria-label="Category manually overridden" />}
        </div>
      )}

      {/* Metadata — their PostMetadata (mx-4), age plus this product's scores. */}
      <div className="pointer-events-none relative z-10 mx-4 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{age}</span>
        <span aria-hidden="true">·</span>
        <ScorePill icon={Flame} label="Trend" value={item.trend_score} variant="trend" />
        {typeof item.opportunity_score === 'number' && (
          <ScorePill icon={Target} label="Opportunity" value={item.opportunity_score} variant="opportunity" />
        )}
        {/* Why this score, in three words. Without it the ranking reads as arbitrary — and a
            `baseline` item in particular is scored against every team's voice pooled together,
            which is worth knowing before acting on it. */}
        {item.score_source && (
          <span title={SCORE_SOURCE_HINT[item.score_source]} className="text-[11px] opacity-70">
            {SCORE_SOURCE_LABEL[item.score_source]}
          </span>
        )}
      </div>

      {/* CardSpace — pushes cover + actions to the bottom edge. */}
      <div className="flex-1" />

      {/* Cover — near-full-bleed (mx-1), unlike the mx-4 text rows above. */}
      <div className="pointer-events-none relative z-10 mx-1 mt-3 aspect-video overflow-hidden rounded-xl bg-muted">
        {isCoverArt ? (
          <img
            src={item.thumbnail_url}
            alt=""
            loading="lazy"
            decoding="async"
            // Some publisher CDNs 403 hotlinked requests that carry a Referer, which surfaces as
            // a broken image rather than an error we could fall back from.
            referrerPolicy="no-referrer"
            onError={() => setThumbnailFailed(true)}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalWidth < MIN_COVER_WIDTH) setThumbnailIsTiny(true);
            }}
            className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          // Badge treatment: tinted canvas with the mark centered and object-contain, so it keeps
          // its own aspect ratio at a legible size instead of being blown up to fill.
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-500/10">
            {badgeLogo ? (
              <span className="flex size-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
                <img
                  src={badgeLogo}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setThumbnailFailed(true)}
                  className="size-7 object-contain"
                />
              </span>
            ) : (
              <CategoryIcon className="size-8 text-muted-foreground/40" aria-hidden="true" />
            )}
          </div>
        )}
      </div>

      {/* Action bar. These are read-only source metrics (HN points, GitHub stars), not actions
          this app can perform, so they render as stats rather than faking clickable
          upvote/bookmark buttons that would do nothing. */}
      <div className="pointer-events-none relative z-10 mx-4 flex h-11 items-center gap-4 text-xs text-muted-foreground">
        {hasEngagement && (
          <>
            <Stat icon={ThumbsUp} value={points} label="points" />
            <Stat icon={MessageCircle} value={comments} label="comments" />
            <Stat icon={Star} value={starsDelta} label="new stars" />
          </>
        )}
      </div>
    </article>
  );
}
