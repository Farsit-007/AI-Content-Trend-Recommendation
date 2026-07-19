import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Newspaper,
  Sparkles,
  Inbox,
  MessageSquare,
  Settings,
  Shield,
  Users,
  Building2,
  Database,
  Palette,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { getTeam } from '@/lib/api/teams';
import { useTeamId } from '@/lib/useTeamId';
import { cn } from '@/lib/utils';

interface StepCardProps {
  step: number;
  icon: React.ElementType;
  title: string;
  description: string;
  to: string;
  cta: string;
}

function StepCard({ step, icon: Icon, title, description, to, cta }: StepCardProps) {
  return (
    <Link
      to={to}
      className="glass-card group flex flex-col gap-3 rounded-xl p-5 transition hover:border-violet-400/30"
    >
      <div className="flex items-center justify-between">
        <div className="flex size-9 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300">
          <Icon className="size-4.5" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">Step {step}</span>
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-violet-300 group-hover:underline">
        {cta} <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

interface RoleCapability {
  icon: React.ElementType;
  title: string;
  description: string;
  to?: string;
}

function CapabilityRow({ icon: Icon, title, description, to }: RoleCapability) {
  const content = (
    <div className="flex items-start gap-3 rounded-lg border border-white/10 p-3 transition hover:border-violet-400/30">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function Guide() {
  const { user } = useAuth();
  const teamId = useTeamId();
  const isSuperAdmin = user?.role === 'super_admin';

  const teamQuery = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId as string),
    enabled: Boolean(teamId),
  });
  const isTeamAdmin = teamQuery.data?.members.find((m) => m._id === user?._id)?.team_role === 'team_admin';

  return (
    <div className="flex flex-col gap-8 pb-8">
      <div className="glass-card flex flex-col gap-3 rounded-xl p-6 sm:p-8">
        <div className="flex items-center gap-2 text-violet-300">
          <BookOpen className="size-5" />
          <span className="text-sm font-medium">Guide</span>
        </div>
        <h1 className="text-3xl font-semibold">
          What is <span className="gradient-text">Growth Studio</span>?
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Growth Studio is an AI content & trend intelligence platform. It watches trending tech
          news across seven sources (Hacker News, dev.to, GitHub Trending, Lobsters, Mastodon,
          Product Hunt, Stack Overflow), scores every story for how relevant and
          "opportunity-worthy" it is to your team, and then turns any story you pick into ready-to-post
          content — in your team's own voice, in Bangla or English — in seconds.
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">
          <strong className="text-foreground">Why it works:</strong> instead of a generic AI writer, every
          generation is grounded in two things — your team's real past posts (so it actually sounds like you,
          not a robot), and the specific facts of the story you're writing about (so it doesn't invent details).
          That combination is what turns "AI slop" into something a team would actually publish.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">The core loop — how to use it</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StepCard
            step={1}
            icon={Newspaper}
            title="Browse the Feed"
            description="See what's trending, filtered to your team's subscribed categories. Sort by Opportunity, Trending, or Newest."
            to="/dashboard/feed"
            cta="Open Feed"
          />
          <StepCard
            step={2}
            icon={Sparkles}
            title="Generate content"
            description="Pick a story (or type your own topic) and generate Facebook, LinkedIn, Reel script, caption, or YouTube idea drafts."
            to="/dashboard/generate"
            cta="Open Generate"
          />
          <StepCard
            step={3}
            icon={Inbox}
            title="Review Drafts"
            description="Everything generated — by you or the overnight auto-generation job — lands here. Approve or dismiss."
            to="/dashboard/drafts"
            cta="Open Drafts"
          />
          <StepCard
            step={4}
            icon={MessageSquare}
            title="Ask questions"
            description="Chat with an assistant grounded in your team's actual news feed — no invented facts."
            to="/dashboard/chat"
            cta="Open Chat"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Make it sound like you</h2>
        <div className="glass-card flex flex-col gap-3 rounded-xl p-5">
          <p className="text-sm text-muted-foreground">
            Generation quality depends entirely on your team's <strong className="text-foreground">brand voice
            examples</strong> — real posts you've written before. With zero examples, generation falls back to a
            neutral voice ("cold start"). Add 25–30 examples in Team Settings for the best results.
          </p>
          <Link
            to="/dashboard/settings/team"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-violet-300 hover:underline"
          >
            Open Team Settings <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Your role: {roleLabel(user?.role, isTeamAdmin)}</h2>
        <p className="text-sm text-muted-foreground">
          Roles are additive. Every member can do the below; a team's own <strong className="text-foreground">team
          admin</strong> can also manage that team's settings and roster; a <strong className="text-foreground">super
          admin</strong> can do everything, for every team.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CapabilityRow
            icon={Newspaper}
            title="Correct a story's category or score"
            description="On any news item, open the drawer and use 'Correct for your team' — it only changes what your team sees."
            to="/dashboard/feed"
          />
        </div>

        {(isTeamAdmin || isSuperAdmin) && (
          <>
            <p className="mt-2 text-sm font-medium text-violet-300">Team admin — everything above, plus:</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CapabilityRow
                icon={Settings}
                title="Set your team's voice, categories & style pack"
                description="Language default, custom instructions, category subscriptions, and default style pack."
                to="/dashboard/settings/team"
              />
              <CapabilityRow
                icon={Users}
                title="Manage your team's roster"
                description="Add or remove members, and promote/demote who else is this team's admin."
                to="/dashboard/settings/team"
              />
            </div>
          </>
        )}

        {isSuperAdmin && (
          <>
            <p className="mt-2 text-sm font-medium text-violet-300">Super admin — everything above, plus:</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CapabilityRow
                icon={Shield}
                title="Monitor & run the ingestion pipeline"
                description="Watch per-source health, trigger a fresh ingestion run or auto-generation run on demand."
                to="/dashboard/admin/pipeline"
              />
              <CapabilityRow
                icon={Users}
                title="Create & manage user accounts"
                description="There is no self-registration — every account is created here."
                to="/dashboard/admin/users"
              />
              <CapabilityRow
                icon={Building2}
                title="Create & manage teams"
                description="Stand up new teams, staff their rosters, edit any team's settings — even ones you don't belong to."
                to="/dashboard/admin/teams"
              />
              <CapabilityRow
                icon={Database}
                title="Curate the global news catalog"
                description="Manually add, correct, or remove a story for every team at once — not just your own."
                to="/dashboard/admin/catalog"
              />
              <CapabilityRow
                icon={Palette}
                title="Curate the shared style-pack library"
                description="Build platform-wide writing styles any team can opt into, teach them example posts, retire or delete them."
                to="/dashboard/admin/style-packs"
              />
            </div>
          </>
        )}
      </section>

      <section className="glass-card flex flex-col gap-2 rounded-xl p-5">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="size-4" />
          <span className="text-sm font-medium">Good to know</span>
        </div>
        <ul className={cn('flex flex-col gap-1.5 text-sm text-muted-foreground')}>
          <li>Every generated draft is a starting point — edit it in place, regenerate a single format, or ask for a tweak ("shorter", "more casual").</li>
          <li>Category/score overrides only affect your own team's view; the shared record stays the same for everyone else.</li>
          <li>Changing your password logs you out of every other device — that's intentional.</li>
          <li>If your team belongs to more than one workspace, switch teams from the dropdown next to the sidebar toggle.</li>
        </ul>
      </section>
    </div>
  );
}

function roleLabel(role: string | undefined, isTeamAdmin: boolean) {
  if (role === 'super_admin') return 'Super Admin';
  if (isTeamAdmin) return 'Team Admin';
  return 'Member';
}
