import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserMinus, Users } from 'lucide-react';
import { removeTeamMember, type TeamMember } from '@/lib/api/teams';
import { Button } from '@/components/ui/button';

interface TeamMembersSectionProps {
  teamId: string;
  members: TeamMember[];
  isAdmin: boolean;
}

/** Read-only roster for every team member; admins additionally get an inline remove action,
 *  reusing the same `DELETE /teams/:id/members/:userId` endpoint the admin console already uses. */
export function TeamMembersSection({ teamId, members, isAdmin }: TeamMembersSectionProps) {
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove member'),
  });

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-violet-300" />
        <div>
          <h2 className="text-lg font-semibold">Team members</h2>
          <p className="text-sm text-muted-foreground">Everyone with access to this team.</p>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {members.length === 0 && <li className="text-sm text-muted-foreground">No members yet.</li>}
        {members.map((member) => (
          <li
            key={member._id}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">{member.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {member.email} · {member.role}
              </span>
            </span>
            {isAdmin && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={removeMutation.isPending && removeMutation.variables === member._id}
                onClick={() => removeMutation.mutate(member._id)}
              >
                <UserMinus className="size-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
