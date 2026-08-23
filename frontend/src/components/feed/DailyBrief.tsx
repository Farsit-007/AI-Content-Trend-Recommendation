import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Target } from 'lucide-react';

import { getNewsItems, type NewsItemDto } from '@/lib/api/news';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const BRIEF_SIZE = 3;

/**
 * Why this item is worth the team's attention, in one line.
 *
 * Derived from data the API already returns rather than generated: an LLM call per item would cost
 * money on every feed load to restate numbers that are already on screen. `score_source` is the
 * interesting part — it says whether the score was measured against *this* team's voice or against
 * the platform-wide baseline, which changes how much weight the number deserves.
 */
const whyThisMatters = (item: NewsItemDto): string => {
  const parts: string[] = [];

  if (typeof item.opportunity_score === 'number') {
    parts.push(
      item.score_source === 'team'
        ? `Scores ${item.opportunity_score.toFixed(1)} against your brand voice`
        : `Scores ${item.opportunity_score.toFixed(1)} on the platform baseline`,
    );
  }
  if (item.category) parts.push(`in ${item.category}`);

  const { points, comments } = item.engagement;
  if (points || comments) parts.push(`${points + comments} reactions so far`);

  return parts.length > 0 ? parts.join(' · ') : 'Newly ingested for your categories';
};

/**
 * The three highest-opportunity stories for this team, with a one-click route into Compose.
 *
 * The feed is an infinite scroll of everything, which answers "what happened" but not "what should
 * I do today" — so the daily decision took a scan of dozens of cards. This is the top of the funnel:
 * a bounded, ranked shortlist that turns the feed from a list into a habit.
 *
 * Deliberately not its own endpoint. It is the feed's own query with `limit=3`, so the ranking can
 * never disagree with what the list below shows — a separate endpoint would be a second definition
 * of "best" to keep in sync.
 */
export function DailyBrief({ teamId, sort }: { teamId: string; sort: string }) {
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['daily-brief', teamId, sort],
    queryFn: () => getNewsItems({ team_id: teamId, sort, page: 1, limit: BRIEF_SIZE }),
  });

  const items = query.data?.data ?? [];

  // Nothing to brief on is not an error state — the empty feed below already explains itself, and a
  // second empty panel above it would just be noise.
  if (!query.isLoading && items.length === 0) return null;

  return (
    <section
      aria-labelledby="daily-brief-heading"
      className="glass-card flex flex-col gap-3 rounded-xl p-5"
    >
      <div className="flex items-center gap-2">
        <Target className="size-4 text-emerald-400" aria-hidden />
        <h2 id="daily-brief-heading" className="text-sm font-medium">
          Today&apos;s best opportunities
        </h2>
        <span className="text-xs text-muted-foreground">for your team</span>
      </div>

      {query.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: BRIEF_SIZE }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={item._id}
              className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-400"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{whyThisMatters(item)}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 self-start sm:self-auto"
                onClick={() =>
                  // Same hand-off the feed's cards use, so Compose opens pre-filled either way.
                  navigate('/dashboard/studio?tab=compose', {
                    state: { newsItemId: item._id, topic: item.title },
                  })
                }
              >
                <Sparkles className="size-3.5" />
                Write
                <ArrowRight className="size-3" />
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
