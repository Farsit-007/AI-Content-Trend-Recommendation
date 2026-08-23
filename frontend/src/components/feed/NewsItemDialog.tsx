import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ExternalLink,
  Flame,
  Loader2,
  MessageCircle,
  PenLine,
  RotateCcw,
  Sparkles,
  Star,
  Target,
  ThumbsUp,
  X,
} from 'lucide-react';
import { clearNewsItemOverride, getNewsItem, setNewsItemOverride, type NewsItemDto } from '@/lib/api/news';
import { getTeamCategories } from '@/lib/api/teams';
import { splitNewsTitle } from '@/lib/newsTitle';
import { isSourceLogoUrl, sourceLogoFor } from '@/lib/sourceLogos';
import { useTeamId } from '@/lib/useTeamId';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScoreMeter } from './ScoreMeter';
import { ScorePill } from './ScorePill';
import { Stat } from './Stat';

interface NewsItemDialogProps {
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

  const categoryOptions = categoriesQuery.data ?? (item.category ? [item.category] : []);

  if (!correcting) {
    return (
      <div className="flex flex-wrap gap-1.5">
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
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">
        This only changes what your team sees — the shared record stays the same for everyone else.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="override-category" className="text-xs text-muted-foreground">
          Category
        </Label>
        <Select value={draftCategory} onValueChange={setDraftCategory} disabled={categoriesQuery.isLoading}>
          <SelectTrigger id="override-category" size="sm">
            <SelectValue placeholder={categoriesQuery.isLoading ? 'Loading…' : 'Pick a category'} />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="override-score" className="text-xs text-muted-foreground">
          Opportunity score
        </Label>
        <Input
          id="override-score"
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={draftScore}
          onChange={(e) => setDraftScore(e.target.value)}
          placeholder="0–10"
          className="h-8"
        />
      </div>

      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          disabled={saveOverrideMutation.isPending}
          onClick={() => saveOverrideMutation.mutate()}
          className="gap-1.5"
        >
          {saveOverrideMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setCorrecting(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Cover art. Capped at daily.dev's 25.625rem so it illustrates the article rather than dominating
 *  it, and a source logo (which metaEnrichment backfills into `thumbnail_url`) is only ever shown
 *  as a centered badge — stretching a 16px favicon just reads as a blurry blank block. */
function DetailCover({ item }: { item: NewsItemDto }) {
  const [failed, setFailed] = useState(false);
  const [isTiny, setIsTiny] = useState(false);

  const hasThumbnail = Boolean(item.thumbnail_url) && !failed;
  const isCoverArt = hasThumbnail && !isSourceLogoUrl(item.thumbnail_url) && !isTiny;

  // Unlike the card, the detail view has the source mark in its header row already, so a
  // logo-only item gets no cover block at all rather than a redundant badge.
  if (!isCoverArt) return null;

  return (
    <img
      src={item.thumbnail_url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={(e) => {
        // Same 240px floor as NewsCard — below that it's a mark, not a photo.
        if (e.currentTarget.naturalWidth && e.currentTarget.naturalWidth < 240) setIsTiny(true);
      }}
      className="mt-4 aspect-[100/49] w-full max-w-[25.625rem] rounded-2xl border border-border object-cover"
    />
  );
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

export function NewsItemDialog({ newsItemId, onOpenChange }: NewsItemDialogProps) {
  const navigate = useNavigate();
  const teamId = useTeamId();
  const open = newsItemId !== null;

  // Radix keeps the dialog mounted through its close animation, but `newsItemId` goes null the
  // instant it starts — so the body used to vanish a beat before the box did. Holding the last
  // opened id keeps content on screen until the animation finishes. This is the React docs'
  // "adjusting state when props change" pattern: a render-time update, not an effect.
  const [renderedId, setRenderedId] = useState(newsItemId);
  if (newsItemId !== null && newsItemId !== renderedId) setRenderedId(newsItemId);

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['news-item', renderedId],
    queryFn: () => getNewsItem(renderedId as string),
    enabled: renderedId !== null,
  });

  const handleGenerate = () => {
    if (!item) return;
    navigate('/dashboard/generate', { state: { newsItemId: item._id, topic: item.title } });
  };

  const hostname = (() => {
    if (!item) return '';
    try {
      return new URL(item.url).hostname.replace(/^www\./, '');
    } catch {
      return item.url;
    }
  })();

  const { heading, handle } = item ? splitNewsTitle(item.title) : { heading: '', handle: undefined };
  const logo = item ? sourceLogoFor(item.source) : undefined;
  const body = item?.content ?? item?.description ?? item?.snippet;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      {/* Mirrors daily.dev's ArticlePostModal (dailydotdev/apps): an XLarge modal whose body is a
          two-column PostContent — article on the left, a bordered widgets rail on the right.
          `showCloseButton={false}` because the default one is absolutely positioned at the
          top-right, which in a two-column dialog lands on top of the rail's primary action. The
          header bar below owns the close button instead, so it can never collide with content. */}
      {/* Fixed height, not max-height: while the item is loading the box would otherwise be only
          as tall as the spinner and then expand outward from its own centre once content arrived,
          which reads as a flash every time a card is opened. */}
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] max-h-none flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        {isLoading && (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        )}

        {isError && (
          <div className="flex flex-1 items-center justify-center text-sm text-red-500 dark:text-red-400">
            Couldn't load this item.
          </div>
        )}

        {item && (
          <>
            {/* Header bar — source identity on the left, window controls on the right. Giving the
                close button a row of its own is what stops it landing on the Generate CTA. */}
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border">
                {logo ? (
                  <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-4.5 object-contain" />
                ) : (
                  <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 truncate text-sm font-medium text-foreground capitalize">
                {item.source.replace(/_/g, ' ')}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">
                ·
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeAge(item.published_at ?? item.created_at)}
              </span>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <Button asChild variant="ghost" size="icon-sm" title={`Read on ${hostname}`}>
                  <a href={item.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="size-4" />
                    <span className="sr-only">Open original article</span>
                  </a>
                </Button>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon-sm">
                    <X className="size-4" />
                    <span className="sr-only">Close</span>
                  </Button>
                </DialogClose>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            {/* Left column — the article itself. */}
            <article className="flex min-w-0 flex-1 flex-col px-6 py-6 lg:overflow-y-auto">
              {/* Title — their typo-large-title h1. This is the hero of the detail view. */}
              <DialogTitle asChild>
                <h1 className="text-2xl leading-tight font-bold break-words text-foreground">{heading}</h1>
              </DialogTitle>
              {handle && <p className="mt-1 text-sm text-muted-foreground">{handle}</p>}

              {/* Summary — their TL;DR block, the first thing you actually read. */}
              {item.impact_note && (
                <div className="mt-6 text-[15px] leading-relaxed break-words text-muted-foreground">
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground/80 uppercase">
                    Why it matters
                  </p>
                  {item.impact_note}
                </div>
              )}

              {/* Tags. */}
              {item.category && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs font-medium text-brand">
                  <span>#{item.category.replace(/\s+/g, '')}</span>
                  {item.is_overridden && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-trend dark:border-amber-400/30 dark:bg-amber-400/10">
                      <PenLine className="size-3" /> Corrected by your team
                    </span>
                  )}
                </div>
              )}

              {/* Metadata row — scores and source engagement. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <ScorePill icon={Flame} label="Trend" value={item.trend_score} variant="trend" />
                {typeof item.opportunity_score === 'number' && (
                  <ScorePill icon={Target} label="Opportunity" value={item.opportunity_score} variant="opportunity" />
                )}
                <Stat icon={ThumbsUp} value={item.engagement.points} label="points" />
                <Stat icon={MessageCircle} value={item.engagement.comments} label="comments" />
                <Stat icon={Star} value={item.engagement.stars_delta} label="new stars" />
              </div>

              {/* Cover — capped width, below the summary rather than above the title. */}
              <DetailCover item={item} />

              {body && (
                <div className="mt-6 border-t border-border pt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {item.content ? 'Full content' : item.description ? 'Description' : 'Snippet'}
                  </p>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/90">{body}</p>
                </div>
              )}

              <DialogDescription className="sr-only">
                Article from {item.source.replace(/_/g, ' ')} — {hostname}
              </DialogDescription>
            </article>

            {/* Right rail — their PostWidgets: actions and team tools, border-l at laptop. */}
            <aside className="flex shrink-0 flex-col gap-4 border-t border-border px-6 py-6 lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l">
              {/* Hidden on mobile, where the sticky footer below carries the same action rather
                  than burying it under the full article text. */}
              <Button onClick={handleGenerate} className="btn-glow hidden w-full gap-2 lg:flex">
                <Sparkles className="size-4" /> Generate content
              </Button>

              <div className="flex flex-col gap-1.5">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm break-all text-brand hover:underline"
                >
                  <ExternalLink className="size-3.5 shrink-0" /> Read on {hostname}
                </a>
                {item.discussion_url && (
                  <a
                    href={item.discussion_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <MessageCircle className="size-3.5 shrink-0" /> Discussion
                  </a>
                )}
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <ScoreMeter label="Trend" value={item.trend_score} variant="trend" />
                {typeof item.opportunity_score === 'number' && (
                  <ScoreMeter label="Opportunity" value={item.opportunity_score} variant="opportunity" />
                )}
              </div>

              {teamId && (
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground">Wrong for your team?</p>
                  <OverrideControls key={item._id} item={item} teamId={teamId} />
                </div>
              )}
            </aside>
            </div>

            {/* Mobile primary action. On small screens the rail stacks below the article, which
                would put the main CTA behind a full scroll of body text — this keeps it pinned. */}
            <div className="shrink-0 border-t border-border p-3 lg:hidden">
              <Button onClick={handleGenerate} className="btn-glow w-full gap-2">
                <Sparkles className="size-4" /> Generate content
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
