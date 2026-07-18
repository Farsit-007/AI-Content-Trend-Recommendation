import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, PlayCircle, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { getIngestionRuns } from '@/lib/api/ingestionRuns';
import { getMaintenanceRuns } from '@/lib/api/maintenanceRuns';
import { triggerIngestion } from '@/lib/api/news';
import { triggerAutoGeneration } from '@/lib/api/content';
import { listTeams } from '@/lib/api/teams';
import { useTour } from '@/context/tour-context';
import { PAGE_TOURS } from '@/lib/tours';
import type { IngestionRun, IngestionRunSourceCount, MaintenanceRun, RetentionCounts } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHelp } from '@/components/dashboard/PageHelp';

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

const RETENTION_REASON_STYLES: Record<keyof RetentionCounts['archived'], string> = {
  max_age: 'border-white/10 bg-white/5 text-muted-foreground',
  trend_floor: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
  source_removed: 'border-red-400/40 bg-red-400/10 text-red-400',
};

function RetentionRunRow({ run }: { run: MaintenanceRun }) {
  const counts = run.counts as RetentionCounts;
  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-3 pr-4 align-top whitespace-nowrap text-sm">{formatTimestamp(run.started_at)}</td>
      <td className="py-3 pr-4 align-top whitespace-nowrap text-sm text-muted-foreground">{run.duration_ms}ms</td>
      <td className="py-3 pr-4 align-top">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(counts.archived) as (keyof RetentionCounts['archived'])[]).map((reason) => (
            <span
              key={reason}
              className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap', RETENTION_REASON_STYLES[reason])}
            >
              {reason}: {counts.archived[reason]}
            </span>
          ))}
        </div>
      </td>
      <td className="py-3 pr-4 align-top text-sm text-muted-foreground whitespace-nowrap">{counts.deleted} deleted</td>
      <td className="py-3 align-top text-sm text-amber-400">{run.error}</td>
    </tr>
  );
}

export default function Admin() {
  const queryClient = useQueryClient();
  const { startTour } = useTour();
  const [autoGenTeamId, setAutoGenTeamId] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['ingestion-runs'],
    queryFn: () => getIngestionRuns(20),
  });

  const teamsQuery = useQuery({ queryKey: ['teams', 'all'], queryFn: listTeams });

  const ingestMutation = useMutation({
    mutationKey: ['ingestion'],
    mutationFn: triggerIngestion,
    onSuccess: (summary) => {
      toast.success(`Ingestion complete — ${summary.totalStored} new items stored`);
      queryClient.invalidateQueries({ queryKey: ['ingestion-runs'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Ingestion run failed'),
  });

  const autoGenMutation = useMutation({
    mutationFn: () => triggerAutoGeneration(autoGenTeamId || undefined),
    onSuccess: (summary) => {
      toast.success(
        `Auto-generation complete — ${summary.drafts_created} drafts created across ${summary.teams_processed} team(s)`,
      );
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Auto-generation run failed'),
  });

  const {
    data: retentionData,
    isLoading: isRetentionLoading,
    isError: isRetentionError,
    refetch: refetchRetention,
    isFetching: isRetentionFetching,
  } = useQuery({
    queryKey: ['maintenance-runs', 'retention'],
    queryFn: () => getMaintenanceRuns(20, 'retention'),
  });

  const alerting = data?.sourceHealth.filter((s) => s.alert) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Monitor and manually run the news ingestion + auto-generation jobs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              refetch();
              refetchRetention();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw className={cn('size-3.5', (isFetching || isRetentionFetching) && 'animate-spin')} />
            Refresh
          </button>
          <PageHelp guideKey="pipeline" onStartTour={() => startTour(PAGE_TOURS.pipeline)} />
        </div>
      </div>

      <section data-tour="pipeline-run" className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Run on demand</h2>
          <p className="text-sm text-muted-foreground">
            A scheduler already runs both jobs automatically — use these to force a run right now (e.g. right
            before a demo).
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 flex-col gap-2 rounded-lg border border-white/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap className="size-4 text-amber-400" /> Ingestion pipeline
            </div>
            <p className="text-xs text-muted-foreground">
              Fetches every source now, dedupes, scores, and stores fresh items. Heavy — one embedding + LLM
              call per surviving item.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit gap-1.5"
              disabled={ingestMutation.isPending}
              onClick={() => ingestMutation.mutate()}
            >
              {ingestMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
              Run ingestion now
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-2 rounded-lg border border-white/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-violet-300" /> Auto-generation job
            </div>
            <p className="text-xs text-muted-foreground">
              Drafts content for each team's top news items. Skips teams with zero brand-voice examples, and
              skips items already drafted.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={autoGenTeamId}
                onChange={(e) => setAutoGenTeamId(e.target.value)}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="" className="bg-background text-foreground">
                  Every team
                </option>
                {(teamsQuery.data ?? []).map((team) => (
                  <option key={team._id} value={team._id} className="bg-background text-foreground">
                    {team.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit gap-1.5"
                disabled={autoGenMutation.isPending}
                onClick={() => autoGenMutation.mutate()}
              >
                {autoGenMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                Run auto-generation now
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section data-tour="pipeline-health" className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6">
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

      <section className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Recent retention runs</h2>
          <p className="text-sm text-muted-foreground">Last {retentionData?.runs.length ?? 0} runs, newest first.</p>
        </div>

        {isRetentionLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading runs…
          </div>
        ) : isRetentionError ? (
          <p className="text-sm text-red-400">Couldn't load retention run history.</p>
        ) : retentionData && retentionData.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No retention runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-medium">Started</th>
                  <th className="py-2 pr-4 font-medium">Duration</th>
                  <th className="py-2 pr-4 font-medium">Archived by reason</th>
                  <th className="py-2 pr-4 font-medium">Deleted</th>
                  <th className="py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {retentionData?.runs.map((run) => (
                  <RetentionRunRow key={run._id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
