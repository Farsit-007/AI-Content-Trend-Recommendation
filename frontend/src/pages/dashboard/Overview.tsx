import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Clock,
  FileText,
  Inbox,
  Loader2,
  Mic,
  Newspaper,
  Palette,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useTour } from '@/context/tour-context';
import { useTeamId } from '@/lib/useTeamId';
import { getOverviewStats } from '@/lib/api/stats';
import { PAGE_TOURS } from '@/lib/tours';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/StatCard';
import { PageHelp } from '@/components/dashboard/PageHelp';

const roleLabel: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'Member',
};

const STATUS_CHIP: Record<string, string> = {
  draft: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
  approved: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400',
  dismissed: 'border-white/10 bg-white/5 text-muted-foreground',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function Overview() {
  const { user } = useAuth();
  const teamId = useTeamId();
  const { startTour } = useTour();
  const isElevated = user?.role === 'admin' || user?.role === 'super_admin';

  const query = useQuery({
    queryKey: ['stats-overview', teamId],
    queryFn: () => getOverviewStats(teamId),
  });

  const stats = query.data;

  return (
    <div className="flex flex-col gap-8 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome back, <span className="gradient-text">{user?.name}</span>
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {user?.email}
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs">
              {roleLabel[user?.role ?? ''] ?? user?.role}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/guide"
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/30 bg-violet-400/5 px-3 py-1.5 text-sm text-violet-300 transition hover:bg-violet-400/10"
          >
            <Sparkles className="size-3.5" /> How Growth Studio works
          </Link>
          <PageHelp guideKey="overview" onStartTour={() => startTour(PAGE_TOURS.overview)} />
        </div>
      </div>

      {query.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
          <AlertTriangle className="size-6 text-red-400" />
          <p className="text-sm text-muted-foreground">Couldn't load your stats. Try refreshing the page.</p>
        </div>
      )}

      {!query.isLoading && !query.isError && !stats?.team && !stats?.system && (
        <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
          <Users className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You don't belong to a team yet — ask an admin to add you to one.
          </p>
        </div>
      )}

      {stats?.system && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Platform</h2>
            <span className="text-xs text-muted-foreground">— everything, across every team</span>
          </div>

          {stats.system.alerting_sources_count > 0 && (
            <Link
              to="/dashboard/admin/pipeline"
              className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300 transition hover:bg-amber-400/15"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4" />
                {stats.system.alerting_sources_count} ingestion source
                {stats.system.alerting_sources_count > 1 ? 's have' : ' has'} returned nothing for 3+ runs in a row
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Newspaper}
              label="News items in the catalog"
              value={stats.system.total_news_items.toLocaleString()}
              hint={`+${stats.system.news_items_last_24h.toLocaleString()} in the last 24h`}
              accent="amber"
              to="/dashboard/feed"
            />
            <StatCard
              icon={Building2}
              label="Teams"
              value={stats.system.total_teams}
              accent="sky"
              to="/dashboard/admin/teams"
            />
            <StatCard
              icon={Users}
              label="User accounts"
              value={stats.system.total_users}
              hint={`${stats.system.users_by_role.admin + stats.system.users_by_role.super_admin} admin${stats.system.users_by_role.admin + stats.system.users_by_role.super_admin === 1 ? '' : 's'}, ${stats.system.users_by_role.user} member${stats.system.users_by_role.user === 1 ? '' : 's'}`}
              accent="violet"
              to="/dashboard/admin/users"
            />
            <StatCard
              icon={FileText}
              label="Drafts generated platform-wide"
              value={stats.system.total_drafts}
              hint={`${stats.system.drafts_by_status.approved} approved`}
              accent="emerald"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="glass-card flex items-center gap-3 rounded-xl p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
                <Clock className="size-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Last ingestion run</p>
                {stats.system.last_ingestion_run ? (
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(stats.system.last_ingestion_run.started_at)} · {stats.system.last_ingestion_run.total_stored} stored ·{' '}
                    {stats.system.last_ingestion_run.trigger}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No runs recorded yet.</p>
                )}
              </div>
              <Link to="/dashboard/admin/pipeline" className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                <ArrowRight className="size-4" />
              </Link>
            </div>

            {user?.role === 'super_admin' && (
              <div className="glass-card flex items-center gap-3 rounded-xl p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
                  <Palette className="size-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Style pack library</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.system.active_style_packs} active · {stats.system.total_style_packs} total
                  </p>
                </div>
                <Link to="/dashboard/admin/style-packs" className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {stats?.team && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{stats.team.team_name}</h2>
            <span className="text-xs text-muted-foreground">— your team's activity</span>
          </div>

          {stats.team.is_cold_start && (
            <Link
              to="/dashboard/settings/team"
              className="flex items-center justify-between gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm text-violet-200 transition hover:bg-violet-400/15"
            >
              <span className="flex items-center gap-2">
                <Mic className="size-4" />
                No brand voice examples yet — generation is running in a neutral, generic voice until you add some.
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 font-medium">
                Add examples <ArrowRight className="size-4" />
              </span>
            </Link>
          )}

          <div data-tour="overview-team-stats" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={FileText}
              label="Drafts"
              value={stats.team.drafts.total}
              hint={`${stats.team.drafts.draft} awaiting review`}
              accent="amber"
              to="/dashboard/drafts"
            />
            <StatCard
              icon={TrendingUp}
              label="High-opportunity stories this week"
              value={stats.team.high_opportunity_items_count}
              hint="score ≥ 7.5"
              accent="emerald"
              to="/dashboard/feed"
            />
            <StatCard
              icon={Mic}
              label="Brand voice examples"
              value={stats.team.brand_voice_examples_count}
              hint={stats.team.is_cold_start ? 'cold start — add some' : 'grounding every generation'}
              accent="violet"
              to="/dashboard/settings/team"
            />
            <StatCard
              icon={Users}
              label="Team members"
              value={stats.team.members_count}
              accent="sky"
              to="/dashboard/settings/team"
            />
          </div>

          <div data-tour="overview-recent-drafts" className="glass-card flex flex-col gap-3 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground">Recent drafts</h3>
              <Link
                to="/dashboard/drafts"
                className="inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:underline"
              >
                View all <ArrowRight className="size-3" />
              </Link>
            </div>

            {stats.team.recent_drafts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Inbox className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nothing generated yet.{' '}
                  <Link to="/dashboard/generate" className="text-violet-300 hover:underline">
                    Generate your first draft
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {stats.team.recent_drafts.map((draft) => (
                  <li
                    key={draft._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground/90">{draft.topic}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{timeAgo(draft.created_at)}</span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-xs capitalize', STATUS_CHIP[draft.status])}>
                        {draft.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Jump back in</h2>
        <div data-tour="overview-quick-actions" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            icon={Newspaper}
            title="Browse the Feed"
            description="See what's trending right now."
            to="/dashboard/feed"
          />
          <QuickAction
            icon={Sparkles}
            title="Generate content"
            description="Turn a trend into a ready-to-post draft."
            to="/dashboard/generate"
          />
          {isElevated ? (
            <QuickAction
              icon={Zap}
              title="Run the pipeline"
              description="Trigger a fresh ingestion or auto-generation run."
              to="/dashboard/admin/pipeline"
            />
          ) : (
            <QuickAction
              icon={Users}
              title="Ask Growth Studio"
              description="Chat with an assistant grounded in your feed."
              to="/dashboard/chat"
            />
          )}
        </div>
      </section>

      {query.isFetching && !query.isLoading && (
        <div className="fixed right-4 bottom-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Loader2 className="size-3 animate-spin" /> Refreshing…
        </div>
      )}
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  description,
  to,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="glass-card group flex items-center gap-3 rounded-xl p-4 transition hover:border-violet-400/30"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-violet-300" />
    </Link>
  );
}
