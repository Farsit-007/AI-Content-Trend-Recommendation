import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, PlugZap, RefreshCw } from 'lucide-react';
import { getAnalytics, getReport, type AnalyticsRollup } from '@/lib/api/analytics';
import { useTeamId } from '@/lib/useTeamId';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCards } from '@/components/report/StatCards';
import { TopPostsTable } from '@/components/report/TopPostsTable';
import { BestTimesHeatmap } from '@/components/report/BestTimesHeatmap';
import { FormatBreakdown } from '@/components/report/FormatBreakdown';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function StatusBanner({ rollup }: { rollup: AnalyticsRollup }) {
  if (rollup.status === 'not_connected') {
    return (
      <div className="glass-card flex flex-col items-start gap-3 rounded-xl p-6">
        <div className="flex items-center gap-2 text-amber-300">
          <PlugZap className="size-5" />
          <span className="font-medium capitalize">{rollup.platform} isn’t connected</span>
        </div>
        <p className="text-muted-foreground text-sm">
          Connect the account to pull real performance data, or reconnect if the token expired.
        </p>
        <Link
          to="/dashboard/settings/platforms"
          className="btn-glow rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Go to Platform settings
        </Link>
      </div>
    );
  }

  if (rollup.status === 'pending_approval') {
    return (
      <div className="glass-card flex items-center gap-2 rounded-xl p-6 text-cyan-300">
        <Clock className="size-5" />
        <span className="text-sm">This platform is pending API approval — real data will appear once approved.</span>
      </div>
    );
  }

  // error
  return (
    <div className="glass-card flex items-center gap-2 rounded-xl p-6 text-red-300">
      <AlertTriangle className="size-5" />
      <span className="text-sm">
        Couldn’t fetch data. Last attempt {new Date(rollup.fetched_at).toLocaleString()}. It’ll retry on the next refresh.
      </span>
    </div>
  );
}

function PlatformPanel({ rollup }: { rollup: AnalyticsRollup }) {
  if (rollup.status !== 'ok') return <StatusBanner rollup={rollup} />;

  return (
    <div className="flex flex-col gap-6">
      {rollup.is_mock && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300">
          Demo data
        </span>
      )}
      <StatCards overview={rollup.overview} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Best times to post">
          <BestTimesHeatmap bestTimes={rollup.best_times} />
        </Section>
        <Section title="Format breakdown">
          <FormatBreakdown breakdown={rollup.content_breakdown} />
        </Section>
      </div>
      <Section title="Top posts">
        <TopPostsTable posts={rollup.top_posts} />
      </Section>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

export default function Report() {
  const teamId = useTeamId();
  const [active, setActive] = useState<string | null>(null);

  const analyticsQuery = useQuery({
    queryKey: ['analytics', teamId],
    queryFn: () => getAnalytics(teamId!),
    enabled: Boolean(teamId),
  });

  const reportQuery = useQuery({
    queryKey: ['report', teamId],
    queryFn: () => getReport(teamId!),
    enabled: Boolean(teamId),
  });

  const rollups = useMemo(() => analyticsQuery.data ?? [], [analyticsQuery.data]);
  const activePlatform = active ?? rollups[0]?.platform ?? null;
  const activeRollup = rollups.find((r) => r.platform === activePlatform) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          <span className="gradient-text">Analytics</span> Report
        </h1>
        {reportQuery.data?.ai_insight && (
          <p className="text-muted-foreground max-w-2xl text-sm">{reportQuery.data.ai_insight}</p>
        )}
      </div>

      {!teamId && <p className="text-muted-foreground text-sm">No team selected.</p>}

      {teamId && analyticsQuery.isLoading && <ReportSkeleton />}

      {teamId && analyticsQuery.isError && (
        <div className="glass-card flex items-center gap-2 rounded-xl p-6 text-red-300">
          <AlertTriangle className="size-5" />
          <span className="text-sm">Failed to load analytics.</span>
          <button
            onClick={() => analyticsQuery.refetch()}
            className="ml-2 inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
          >
            <RefreshCw className="size-3" /> Retry
          </button>
        </div>
      )}

      {teamId && !analyticsQuery.isLoading && !analyticsQuery.isError && rollups.length === 0 && (
        <div className="glass-card flex flex-col items-start gap-3 rounded-xl p-6">
          <p className="text-muted-foreground text-sm">No platforms connected yet.</p>
          <Link
            to="/dashboard/settings/platforms"
            className="btn-glow rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            Connect a platform
          </Link>
        </div>
      )}

      {rollups.length > 0 && (
        <>
          <div className="flex gap-2 border-white/10 border-b">
            {rollups.map((r) => (
              <button
                key={r.platform}
                onClick={() => setActive(r.platform)}
                className={cn(
                  'relative px-3 py-2 text-sm capitalize transition-colors',
                  r.platform === activePlatform
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.platform}
                {r.platform === activePlatform && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-violet-400" />
                )}
              </button>
            ))}
          </div>
          {activeRollup && <PlatformPanel rollup={activeRollup} />}
        </>
      )}
    </div>
  );
}
