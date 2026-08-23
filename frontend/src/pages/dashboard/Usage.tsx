import { useQuery } from '@tanstack/react-query';
import { Gauge, Info } from 'lucide-react';

import { getUsageSummary, type UsageBucket } from '@/lib/api/llmUsage';
import { useTeamId } from '@/lib/useTeamId';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/dashboard/PageHeader';

const compactNumber = (value: number): string =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** Four decimals, because a day of light use costs fractions of a cent and `$0.00` reads as free. */
const money = (value: number): string => `$${value.toFixed(4)}`;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-card flex flex-col gap-1 rounded-xl p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function BucketBars({ buckets, emptyLabel }: { buckets: UsageBucket[]; emptyLabel: string }) {
  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(...buckets.map((b) => b.prompt_tokens + b.completion_tokens), 1);

  return (
    <ul className="flex flex-col gap-2">
      {buckets.map((bucket) => {
        const total = bucket.prompt_tokens + bucket.completion_tokens;
        return (
          <li key={bucket.key} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate text-muted-foreground">{bucket.key}</span>
            <span
              className="h-2 shrink-0 rounded-full bg-violet-500/70"
              style={{ width: `${Math.max(2, (total / max) * 100)}%` }}
              aria-hidden
            />
            <span className="tabular-nums text-muted-foreground">
              {compactNumber(total)} tokens · {bucket.calls} calls
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What this team has spent on AI, from the usage ledger.
 *
 * Two things are deliberately shown rather than hidden, because both would otherwise make the page
 * quietly misleading:
 *
 *  - **Unpriced calls.** A model with no configured price contributes no cost, so the dollar figure
 *    is a floor, not a total. Saying so is the difference between a number and a guess.
 *  - **Cache savings.** `cached_prompt_tokens` is what proves prompt caching is working; a run of
 *    zeroes there means it is not, and that is worth being able to see.
 */
export default function Usage() {
  const teamId = useTeamId();

  const query = useQuery({
    queryKey: ['llm-usage', teamId],
    queryFn: () => getUsageSummary(teamId ? { team_id: teamId } : {}),
    enabled: Boolean(teamId),
  });

  if (!teamId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="AI usage" icon={Gauge} />
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={Gauge}
            title="No team yet"
            description="Usage is measured per team — you need to belong to one to see it."
          />
        </div>
      </div>
    );
  }

  const totals = query.data?.totals;
  const cacheRate =
    totals && totals.prompt_tokens > 0 ? totals.cached_prompt_tokens / totals.prompt_tokens : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="AI usage"
        icon={Gauge}
        description="Tokens and estimated cost for this team over the last 30 days."
      />

      {query.isLoading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {query.error && <ErrorState error={query.error} onRetry={() => query.refetch()} />}

      {totals && query.data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Calls" value={compactNumber(totals.calls)} />
            <StatTile
              label="Tokens in"
              value={compactNumber(totals.prompt_tokens)}
              hint={cacheRate > 0 ? `${Math.round(cacheRate * 100)}% served from cache` : undefined}
            />
            <StatTile label="Tokens out" value={compactNumber(totals.completion_tokens)} />
            <StatTile
              label="Estimated cost"
              value={money(totals.estimated_cost_usd)}
              hint={totals.calls_without_usage > 0 ? 'a floor — see below' : undefined}
            />
          </div>

          {totals.calls_without_usage > 0 && (
            <p
              role="status"
              className="flex items-start gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-muted-foreground"
            >
              <Info className="mt-px size-3.5 shrink-0 text-amber-400" />
              {totals.calls_without_usage} of {totals.calls} calls came back without token counts, and
              models with no configured price add no cost. Treat these figures as a floor rather than
              a total.
            </p>
          )}

          <section className="glass-card flex flex-col gap-3 rounded-xl p-5">
            <h2 className="text-sm font-medium">By feature</h2>
            <BucketBars
              buckets={query.data.by_task}
              emptyLabel="Nothing recorded in this window yet."
            />
          </section>

          <section className="glass-card flex flex-col gap-3 rounded-xl p-5">
            <h2 className="text-sm font-medium">By day</h2>
            <BucketBars
              buckets={query.data.by_day}
              emptyLabel="Nothing recorded in this window yet."
            />
          </section>
        </>
      )}
    </div>
  );
}
