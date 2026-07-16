import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { getIngestionRuns } from '@/lib/api/ingestionRuns';
import type { IngestionRun, IngestionRunSourceCount } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function SourceChip({ count }: { count: IngestionRunSourceCount }) {
  const isDead = count.fetched === 0;
  return (
    <span
      title={count.error}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap',
        isDead ? 'border-amber-400/40 bg-amber-400/10 text-amber-400' : 'border-white/10 bg-white/5 text-muted-foreground',
      )}
    >
      <span className="font-medium text-foreground">{count.source}</span>
      {count.fetched}
      {'→'}
      {count.stored}
    </span>
  );
}

function RunRow({ run }: { run: IngestionRun }) {
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-3 pr-4 align-top whitespace-nowrap text-sm">{formatTimestamp(run.started_at)}</td>
      <td className="py-3 pr-4 align-top whitespace-nowrap">
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-xs capitalize',
            run.trigger === 'manual' ? 'border-violet-400/40 text-violet-400' : 'border-white/10 text-muted-foreground',
          )}
        >
          {run.trigger}
        </span>
      </td>
      <td className="py-3 pr-4 align-top text-sm text-muted-foreground whitespace-nowrap">{run.total_stored} stored</td>
      <td className="py-3 pr-4 align-top">
        <div className="flex flex-wrap gap-1.5">
          {run.sources.map((s) => (
            <SourceChip key={s.source} count={s} />
          ))}
        </div>
      </td>
      <td className="py-3 align-top text-sm text-amber-400">{run.error}</td>
    </tr>
  );
}

export default function Admin() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['ingestion-runs'],
    queryFn: () => getIngestionRuns(20),
  });

  const alerting = data?.sourceHealth.filter((s) => s.alert) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <section className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Source health</h2>
          <p className="text-sm text-muted-foreground">
            A source flagged here fetched zero items in each of its last 3 runs — it may need attention.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading source health…
          </div>
        ) : isError ? (
          <p className="text-sm text-red-400">Couldn't load ingestion run history.</p>
        ) : alerting.length === 0 ? (
          <p className="text-sm text-emerald-400">All sources are healthy.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {alerting.map((s) => (
              <li
                key={s.source}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-sm text-amber-400"
              >
                <AlertTriangle className="size-3.5" />
                {s.source} — {s.zero_streak} runs with 0 fetched
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Recent ingestion runs</h2>
          <p className="text-sm text-muted-foreground">Last {data?.runs.length ?? 0} runs, newest first.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading runs…
          </div>
        ) : isError ? (
          <p className="text-sm text-red-400">Couldn't load ingestion run history.</p>
        ) : data && data.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingestion runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-medium">Started</th>
                  <th className="py-2 pr-4 font-medium">Trigger</th>
                  <th className="py-2 pr-4 font-medium">Stored</th>
                  <th className="py-2 pr-4 font-medium">Sources (fetched{'→'}stored)</th>
                  <th className="py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {data?.runs.map((run) => (
                  <RunRow key={run._id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
