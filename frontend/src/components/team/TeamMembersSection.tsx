import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, UserMinus, Users } from 'lucide-react';
import { removeTeamMember, setTeamMemberRole, type TeamMember, type TeamMemberRole } from '@/lib/api/teams';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface TeamMembersSectionProps {
  teamId: string;
  members: TeamMember[];
  canManageTeam: boolean;
}

/** Read-only roster for every team member; this team's team_admin (or a super_admin) additionally
 *  gets an inline remove action and a promote/demote toggle for `team_role`. The backend rejects
 *  a demote/remove that would leave the team with zero team_admins (400), surfaced as a toast. */
export function TeamMembersSection({ teamId, members, canManageTeam }: TeamMembersSectionProps) {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['team', teamId] });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      toast.success('Member removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove member'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TeamMemberRole }) => setTeamMemberRole(teamId, userId, role),
    onSuccess: (_, { role }) => {
      toast.success(role === 'team_admin' ? 'Promoted to team admin' : 'Demoted to member');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update role'),
  });

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-brand" />
        <div>
          <h2 className="text-lg font-semibold">Team members</h2>
          <p className="text-sm text-muted-foreground">Everyone with access to this team.</p>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {members.length === 0 && <li className="text-sm text-muted-foreground">No members yet.</li>}
        {members.map((member) => {
          const isTeamAdmin = member.team_role === 'team_admin';
          const roleBusy = roleMutation.isPending && roleMutation.variables?.userId === member._id;
          return (
            <li
              key={member._id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 truncate font-medium text-foreground">
                  {member.name}
                  {isTeamAdmin && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                      <ShieldCheck className="size-2.5" /> Team admin
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{member.email}</span>
              </span>
              {canManageTeam && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn('text-xs', isTeamAdmin ? 'text-muted-foreground' : 'text-brand')}
                    disabled={roleBusy}
                    onClick={() =>
                      roleMutation.mutate({ userId: member._id, role: isTeamAdmin ? 'member' : 'team_admin' })
                    }
                  >
                    {isTeamAdmin ? 'Demote' : 'Make admin'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${member.name} from team`}
                    disabled={removeMutation.isPending && removeMutation.variables === member._id}
                    onClick={() => removeMutation.mutate(member._id)}
                  >
                    <UserMinus className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
