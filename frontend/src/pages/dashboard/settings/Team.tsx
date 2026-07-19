import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { useTeamId } from '@/lib/useTeamId';
import { getTeam, getTeamCategories, updateTeam, type TeamVoiceProfile, type UpdateTeamPayload } from '@/lib/api/teams';
import { listStylePacks } from '@/lib/api/stylePacks';
import { Skeleton } from '@/components/ui/skeleton';
import { VoiceProfileSection } from '@/components/team/VoiceProfileSection';
import { CategorySubscriptionsSection } from '@/components/team/CategorySubscriptionsSection';
import { StylePackSection } from '@/components/team/StylePackSection';
import { BrandVoiceSection } from '@/components/team/BrandVoiceSection';
import { CustomCategoriesSection } from '@/components/team/CustomCategoriesSection';
import { TeamMembersSection } from '@/components/team/TeamMembersSection';
import { PageHelp } from '@/components/dashboard/PageHelp';

export default function Team() {
  const { user } = useAuth();
  const teamId = useTeamId();
  const queryClient = useQueryClient();

  const teamQuery = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId as string),
    enabled: Boolean(teamId),
  });

  const categoriesQuery = useQuery({
    queryKey: ['team-categories', teamId],
    queryFn: () => getTeamCategories(teamId as string),
    enabled: Boolean(teamId),
  });

  // Feature-detected once per mount: a 404/network failure here means style packs (6A) aren't
  // deployed yet, so the section below hides instead of erroring.
  const stylePacksQuery = useQuery({
    queryKey: ['style-packs'],
    queryFn: () => listStylePacks(),
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateTeamPayload) => updateTeam(teamId as string, payload),
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Save failed'),
  });

  if (!teamId) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
        <h1 className="text-lg font-semibold">Team settings</h1>
        <p className="text-sm text-muted-foreground">You need to belong to a team to view its settings.</p>
      </div>
    );
  }

  if (teamQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-card flex flex-col gap-3 rounded-xl p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (teamQuery.isError || !teamQuery.data) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
        <h1 className="text-lg font-semibold">Team settings</h1>
        <p className="text-sm text-muted-foreground">Couldn't load this team. Try refreshing the page.</p>
      </div>
    );
  }

  const { team, members } = teamQuery.data;
  // Presence, not shape, is the pre-5A/pre-6A signal — both fields already default to a value
  // on every team document today, so these sections render unless a backend genuinely omits them.
  const subscriptionsAvailable = Array.isArray(team.subscribed_categories);
  const stylePacksAvailable = !stylePacksQuery.isError;
  // Mirrors the backend's requireTeamAdmin: super_admin bypasses regardless of membership;
  // everyone else must specifically be *this* team's team_admin, not just a member.
  const canManageTeam =
    user?.role === 'super_admin' || members.find((m) => m._id === user?._id)?.team_role === 'team_admin';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            <span className="gradient-text">Team</span> Settings
          </h1>
          <p className="text-sm text-muted-foreground">{team.name}</p>
        </div>
        <PageHelp guideKey="team" />
      </div>

      <TeamMembersSection teamId={teamId} members={members} canManageTeam={canManageTeam} />

      <div data-tour="team-voice">
        <VoiceProfileSection
          key={`${team.voice_profile?.default_language ?? 'bangla'}:${team.voice_profile?.custom_instructions ?? ''}`}
          voiceProfile={team.voice_profile}
          canManageTeam={canManageTeam}
          isSaving={updateMutation.isPending}
          onSave={(voice_profile: TeamVoiceProfile) => updateMutation.mutate({ voice_profile })}
        />
      </div>

      {subscriptionsAvailable && (
        <CategorySubscriptionsSection
          key={team.subscribed_categories.join(',')}
          subscribed={team.subscribed_categories}
          categories={categoriesQuery.data ?? []}
          canManageTeam={canManageTeam}
          isSaving={updateMutation.isPending}
          onSave={(subscribed_categories) => updateMutation.mutate({ subscribed_categories })}
        />
      )}

      {stylePacksAvailable && (
        <StylePackSection
          key={team.default_style_pack_id ?? 'none'}
          stylePacks={stylePacksQuery.data ?? []}
          currentId={team.default_style_pack_id}
          canManageTeam={canManageTeam}
          isSaving={updateMutation.isPending}
          onSave={(default_style_pack_id) => updateMutation.mutate({ default_style_pack_id: default_style_pack_id ?? null })}
        />
      )}

      <CustomCategoriesSection key={`custom:${team.custom_categories.join(',')}`} teamId={teamId} customCategories={team.custom_categories} />

      <div data-tour="team-brand-voice">
        <BrandVoiceSection teamId={teamId} canManageTeam={canManageTeam} categories={categoriesQuery.data ?? []} />
      </div>
    </div>
  );
}
