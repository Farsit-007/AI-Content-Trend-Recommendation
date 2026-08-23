import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';

import { getIngestionRuns } from '@/lib/api/ingestionRuns';
import { getMaintenanceRuns } from '@/lib/api/maintenanceRuns';
import { triggerIngestion } from '@/lib/api/news';
import { triggerAutoGeneration } from '@/lib/api/content';
import { listTeams } from '@/lib/api/teams';
import type {
  EngagementRefreshCounts,
  IngestionRun,
  IngestionRunSourceCount,
  MaintenanceRun,
  RetentionCounts,
} from '@/lib/api/types';
import { formatDateTime, formatDuration, timeAgo } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { ConfirmButton } from '@/components/shared/ConfirmButton';

const ALL_TEAMS = 'all';

function SourceChip({ count }: { count: IngestionRunSourceCount }) {
  const isDead = count.fetched === 0;
  const chip = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap',
        isDead
          ? 'border-trend/40 bg-trend-surface text-trend'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      <span className="font-medium text-foreground">{count.source}</span>
      {count.fetched}
      {'→'}
      {count.stored}
    </span>
  );

  // The per-source error is the only place a failing feed explains itself; a tooltip keeps it
  // reachable without widening the row.
  return count.error ? (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{count.error}</TooltipContent>
    </Tooltip>
  ) : (
    chip
  );
}

const RETENTION_REASON_VARIANT: Record<
  keyof RetentionCounts['archived'],
  'muted' | 'trend' | 'destructive'
> = {
  max_age: 'muted',
  trend_floor: 'trend',
  source_removed: 'destructive',
};

const isRetentionRun = (
  run: MaintenanceRun,
): run is MaintenanceRun & { counts: RetentionCounts } => run.job === 'retention';

export default function Admin() {
  const queryClient = useQueryClient();
  const [autoGenTeamId, setAutoGenTeamId] = useState(ALL_TEAMS);
  const [maintenanceJob, setMaintenanceJob] = useState<'retention' | 'engagement_refresh'>(
    'retention',
  );

  const ingestionQuery = useQuery({
    queryKey: ['ingestion-runs'],
    queryFn: () => getIngestionRuns(20),
  });

  const teamsQuery = useQuery({ queryKey: ['teams', 'all'], queryFn: listTeams });

  // Both maintenance jobs write to the same collection; the API filters by `job`, so each tab is
  // its own query rather than one fetch filtered client-side.
  const maintenanceQuery = useQuery({
    queryKey: ['maintenance-runs', maintenanceJob],
    queryFn: () => getMaintenanceRuns(20, maintenanceJob),
  });

  const ingestMutation = useMutation({
    mutationKey: ['ingestion'],
    mutationFn: triggerIngestion,
    onSuccess: (summary) => {
      toast.success('Ingestion complete — ' + summary.totalStored + ' new items stored');
      queryClient.invalidateQueries({ queryKey: ['ingestion-runs'] });
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Ingestion run failed'),
  });

  const autoGenMutation = useMutation({
    mutationFn: () => triggerAutoGeneration(autoGenTeamId === ALL_TEAMS ? undefined : autoGenTeamId),
    onSuccess: (summary) => {
      toast.success(
        'Auto-generation complete — ' +
          summary.drafts_created +
          ' drafts created across ' +
          summary.teams_processed +
          ' team(s)',
      );
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Auto-generation run failed'),
  });

  const runs = ingestionQuery.data?.runs ?? [];
  const sourceHealth = ingestionQuery.data?.sourceHealth ?? [];
  const alerting = sourceHealth.filter((source) => source.alert);
  const lastRun = runs[0];
  const maintenanceRuns = maintenanceQuery.data?.runs ?? [];

  const isRefreshing = ingestionQuery.isFetching || maintenanceQuery.isFetching;

  const ingestionColumns = useMemo<DataTableColumn<IngestionRun>[]>(
    () => [
      {
        id: 'started_at',
        accessorKey: 'started_at',
        header: 'Started',
        sortFn: 'datetime',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{formatDateTime(row.original.started_at)}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(row.original.started_at)}</span>
          </div>
        ),
      },
      {
        id: 'trigger',
        accessorKey: 'trigger',
        header: 'Trigger',
        sortFn: 'text',
        cell: ({ row }) => (
          <Badge variant={row.original.trigger === 'manual' ? 'brand' : 'outline'}>
            {row.original.trigger}
          </Badge>
        ),
      },
      {
        id: 'total_stored',
        accessorKey: 'total_stored',
        header: 'Stored',
        sortFn: 'basic',
        meta: { className: 'tabular-nums whitespace-nowrap' },
        cell: ({ row }) => row.original.total_stored,
      },
      {
        id: 'duration_ms',
        accessorKey: 'duration_ms',
        header: 'Duration',
        sortFn: 'basic',
        meta: { className: 'tabular-nums whitespace-nowrap' },
        cell: ({ row }) => formatDuration(row.original.duration_ms),
      },
      {
        id: 'sources',
        header: 'Sources (fetched→stored)',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.sources.map((source) => (
              <SourceChip key={source.source} count={source} />
            ))}
          </div>
        ),
      },
      {
        id: 'error',
        header: 'Result',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.error ? (
            <span className="text-sm text-destructive">{row.original.error}</span>
          ) : (
            <Badge variant="opportunity">
              <CheckCircle2 />
              OK
            </Badge>
          ),
      },
    ],
    [],
  );

  const maintenanceColumns = useMemo<DataTableColumn<MaintenanceRun>[]>(
    () => [
      {
        id: 'started_at',
        accessorKey: 'started_at',
        header: 'Started',
        sortFn: 'datetime',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{formatDateTime(row.original.started_at)}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(row.original.started_at)}</span>
          </div>
        ),
      },
      {
        id: 'duration_ms',
        accessorKey: 'duration_ms',
        header: 'Duration',
        sortFn: 'basic',
        meta: { className: 'tabular-nums whitespace-nowrap' },
        cell: ({ row }) => formatDuration(row.original.duration_ms),
      },
      {
        id: 'counts',
        header: 'What it did',
        enableSorting: false,
        cell: ({ row }) => {
          if (isRetentionRun(row.original)) {
            const counts = row.original.counts;
            const reasons = Object.keys(counts.archived) as (keyof RetentionCounts['archived'])[];
            return (
              <div className="flex flex-wrap gap-1.5">
                {reasons.map((reason) => (
                  <Badge key={reason} variant={RETENTION_REASON_VARIANT[reason]}>
                    {reason}: {counts.archived[reason]}
                  </Badge>
                ))}
                <Badge variant="outline">{counts.deleted} deleted</Badge>
                {counts.backfilled > 0 && (
                  <Badge variant="outline">{counts.backfilled} backfilled</Badge>
                )}
              </div>
            );
          }
          const counts = row.original.counts as EngagementRefreshCounts;
          const errorCount = Object.keys(counts.errors ?? {}).length;
          return (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="brand">{counts.refreshed} refreshed</Badge>
              <Badge variant="outline">{counts.candidates} candidates</Badge>
              <Badge variant="outline">{counts.request_count} requests</Badge>
              {counts.source_removed > 0 && (
                <Badge variant="trend">{counts.source_removed} gone from source</Badge>
              )}
              {errorCount > 0 && <Badge variant="destructive">{errorCount} errors</Badge>}
            </div>
          );
        },
      },
      {
        id: 'error',
        header: 'Result',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.error ? (
            <span className="text-sm text-destructive">{row.original.error}</span>
          ) : (
            <Badge variant="opportunity">
              <CheckCircle2 />
              OK
            </Badge>
          ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pipeline"
        icon={Activity}
        guideKey="pipeline"
        description="Monitor and manually run the ingestion, auto-generation, and maintenance jobs."
        actions={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              ingestionQuery.refetch();
              maintenanceQuery.refetch();
            }}
          >
            <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Zap}
          label="Ingestion runs kept"
          value={runs.length}
          accent="brand"
          hint="Newest first, capped at 20"
        />
        <StatCard
          icon={Sparkles}
          label="Stored on last run"
          value={lastRun ? lastRun.total_stored : '—'}
          accent="opportunity"
          hint={lastRun ? timeAgo(lastRun.started_at) : 'No runs yet'}
        />
        <StatCard icon={Activity} label="Sources tracked" value={sourceHealth.length} accent="info" />
        <StatCard
          icon={AlertTriangle}
          label="Sources alerting"
          value={alerting.length}
          accent={alerting.length > 0 ? 'trend' : 'opportunity'}
          hint="Zero fetched, 3 runs running"
        />
      </div>

      <section
        data-tour="pipeline-run"
        className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Run on demand</h2>
          <p className="text-sm text-muted-foreground">
            A scheduler already runs both jobs automatically — use these to force a run right now
            (e.g. right before a demo).
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap className="size-4 text-trend" /> Ingestion pipeline
            </div>
            <p className="text-xs text-muted-foreground">
              Fetches every source now, dedupes, scores, and stores fresh items. Heavy — one
              embedding + LLM call per surviving item.
            </p>
            <ConfirmButton
              type="button"
              size="sm"
              variant="outline"
              destructive={false}
              className="w-fit gap-1.5"
              disabled={ingestMutation.isPending}
              title="Run the ingestion pipeline now?"
              description="This calls every source and spends one embedding plus one LLM call per new item."
              confirmLabel="Run ingestion"
              onConfirm={() => ingestMutation.mutate()}
            >
              {ingestMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <PlayCircle className="size-3.5" />
              )}
              Run ingestion now
            </ConfirmButton>
          </div>

          <div className="flex flex-1 flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-brand" /> Auto-generation job
            </div>
            <p className="text-xs text-muted-foreground">
              Drafts content for each team&apos;s top news items. Skips teams with zero brand-voice
              examples, and skips items already drafted.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={autoGenTeamId} onValueChange={setAutoGenTeamId}>
                <SelectTrigger size="sm" className="w-[170px]" aria-label="Team to generate for">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TEAMS}>Every team</SelectItem>
                  {(teamsQuery.data ?? []).map((team) => (
                    <SelectItem key={team._id} value={team._id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ConfirmButton
                type="button"
                size="sm"
                variant="outline"
                destructive={false}
                className="w-fit gap-1.5"
                disabled={autoGenMutation.isPending}
                title="Run auto-generation now?"
                description="Generates drafts for the selected team(s). Each draft costs one LLM call per format."
                confirmLabel="Run auto-generation"
                onConfirm={() => autoGenMutation.mutate()}
              >
                {autoGenMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="size-3.5" />
                )}
                Run auto-generation now
              </ConfirmButton>
            </div>
          </div>
        </div>
      </section>

      <section
        data-tour="pipeline-health"
        className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6"
      >
        <div>
          <h2 className="text-lg font-semibold">Source health</h2>
          <p className="text-sm text-muted-foreground">
            A source flagged here fetched zero items in each of its last 3 runs — it may need
            attention.
          </p>
        </div>

        {ingestionQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading source health…
          </div>
        ) : ingestionQuery.isError ? (
          <p className="text-sm text-destructive">Could not load ingestion run history.</p>
        ) : alerting.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-opportunity">
            <CheckCircle2 className="size-4" />
            All {sourceHealth.length} sources are healthy.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {alerting.map((source) => (
              <li key={source.source}>
                <Badge variant="trend" className="px-3 py-1 text-sm">
                  <AlertTriangle />
                  {source.source} — {source.zero_streak} runs with 0 fetched
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Recent ingestion runs</h2>
          <p className="text-sm text-muted-foreground">Last {runs.length} runs, newest first.</p>
        </div>
        <DataTable
          data={runs}
          columns={ingestionColumns}
          getRowId={(row) => row._id}
          isLoading={ingestionQuery.isLoading}
          isFetching={ingestionQuery.isFetching}
          error={ingestionQuery.error}
          onRetry={() => ingestionQuery.refetch()}
          minWidth={980}
          pageSize={10}
          emptyState={
            <EmptyState
              icon={Zap}
              title="No ingestion runs yet"
              description="Trigger one above, or wait for the scheduler."
            />
          }
          renderMobileCard={(row) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{formatDateTime(row.started_at)}</span>
                <Badge variant={row.trigger === 'manual' ? 'brand' : 'outline'}>{row.trigger}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {row.total_stored} stored · {formatDuration(row.duration_ms)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {row.sources.map((source) => (
                  <SourceChip key={source.source} count={source} />
                ))}
              </div>
            </div>
          )}
        />
      </section>

      <section className="glass-card flex flex-col gap-4 rounded-xl p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Maintenance runs</h2>
          <p className="text-sm text-muted-foreground">
            Retention archives and prunes old stories; the engagement refresh re-scores what is
            still live at the source.
          </p>
        </div>

        <Tabs
          value={maintenanceJob}
          onValueChange={(value) => setMaintenanceJob(value as 'retention' | 'engagement_refresh')}
        >
          <TabsList>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="engagement_refresh">Engagement refresh</TabsTrigger>
          </TabsList>

          <TabsContent value={maintenanceJob}>
            <DataTable
              data={maintenanceRuns}
              columns={maintenanceColumns}
              getRowId={(row) => row._id}
              isLoading={maintenanceQuery.isLoading}
              isFetching={maintenanceQuery.isFetching}
              error={maintenanceQuery.error}
              onRetry={() => maintenanceQuery.refetch()}
              minWidth={880}
              pageSize={10}
              emptyState={
                <EmptyState
                  icon={RefreshCw}
                  title={
                    maintenanceJob === 'retention'
                      ? 'No retention runs yet'
                      : 'No engagement-refresh runs yet'
                  }
                  description="These jobs run on the scheduler; history shows up here after the first run."
                />
              }
              renderMobileCard={(row) => (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{formatDateTime(row.started_at)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(row.duration_ms)}
                  </span>
                  {row.error && <span className="text-xs text-destructive">{row.error}</span>}
                </div>
              )}
            />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
