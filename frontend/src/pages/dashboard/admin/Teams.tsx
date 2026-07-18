import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, ChevronDown, Loader2, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react';
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  removeTeamMember,
  type TeamDto,
} from '@/lib/api/teams';
import { listUsers, type UserDto } from '@/lib/api/users';
import { useTour } from '@/context/tour-context';
import { PAGE_TOURS } from '@/lib/tours';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHelp } from '@/components/dashboard/PageHelp';

function TeamRow({ team, allUsers }: { team: TeamDto; allUsers: UserDto[] }) {
  const [expanded, setExpanded] = useState(false);
  const [addingUserId, setAddingUserId] = useState('');
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['team-detail', team._id],
    queryFn: () => getTeam(team._id),
    enabled: expanded,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['team-detail', team._id] });
    queryClient.invalidateQueries({ queryKey: ['teams', 'all'] });
  };

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => addTeamMember(team._id, userId),
    onSuccess: () => {
      toast.success('Member added');
      setAddingUserId('');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(team._id, userId),
    onSuccess: () => {
      toast.success('Member removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove member'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTeam(team._id),
    onSuccess: () => {
      toast.success(`Deleted "${team.name}"`);
      queryClient.invalidateQueries({ queryKey: ['teams', 'all'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete team'),
  });

  const members = detailQuery.data?.members ?? [];
  const memberIds = new Set(members.map((m) => m._id));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u._id));

  return (
    <div className="glass-card flex flex-col rounded-xl">
      <div className="flex w-full items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">{team.name}</p>
            {team.description && <p className="text-xs text-muted-foreground">{team.description}</p>}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (window.confirm(`Delete team "${team.name}"? This removes its roster; drafts and brand-voice examples are not cascade-deleted.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
          </Button>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="p-1">
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-white/10 p-4">
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading roster…
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {members.length === 0 && <li className="text-sm text-muted-foreground">No members yet.</li>}
                {members.map((m) => (
                  <li
                    key={m._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm"
                  >
                    <span>
                      {m.name} <span className="text-xs text-muted-foreground">{m.email}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={removeMemberMutation.isPending && removeMemberMutation.variables === m._id}
                      onClick={() => removeMemberMutation.mutate(m._id)}
                    >
                      <UserMinus className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>

              {availableUsers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={addingUserId}
                    onChange={(e) => setAddingUserId(e.target.value)}
                    className="h-9 min-w-48 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="" className="bg-background text-foreground">
                      Add a member…
                    </option>
                    {availableUsers.map((u) => (
                      <option key={u._id} value={u._id} className="bg-background text-foreground">
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!addingUserId || addMemberMutation.isPending}
                    onClick={() => addMemberMutation.mutate(addingUserId)}
                    className="gap-1.5"
                  >
                    <UserPlus className="size-3.5" /> Add
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminTeams() {
  const queryClient = useQueryClient();
  const { startTour } = useTour();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const teamsQuery = useQuery({ queryKey: ['teams', 'all'], queryFn: listTeams });
  const usersQuery = useQuery({ queryKey: ['users', ''], queryFn: () => listUsers() });
  const teams = teamsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createTeam,
    onSuccess: (created) => {
      toast.success(`Team "${created.name}" created`);
      setName('');
      setDescription('');
      setMemberIds([]);
      queryClient.invalidateQueries({ queryKey: ['teams', 'all'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create team'),
  });

  const toggleMember = (id: string) => {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Team name is required');
      return;
    }
    createMutation.mutate({ name: name.trim(), description: description.trim() || undefined, member_ids: memberIds });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            <span className="gradient-text">Team</span> management
          </h1>
          <p className="text-sm text-muted-foreground">
            Stand up new teams and manage any team's roster — any admin can edit any team, even ones they don't
            personally belong to.
          </p>
        </div>
        <PageHelp guideKey="teams" onStartTour={() => startTour(PAGE_TOURS.teams)} />
      </div>

      <section data-tour="teams-create" className="glass-card flex flex-col gap-4 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-violet-300" />
          <h2 className="font-semibold">Create a team</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {users.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Starting members (optional)</span>
            <div className="flex flex-wrap gap-1.5">
              {users.map((u) => {
                const active = memberIds.includes(u._id);
                return (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => toggleMember(u._id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition',
                      active
                        ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                        : 'border-white/10 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Button
          type="button"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="btn-glow w-fit gap-2 bg-violet-600 hover:bg-violet-500"
        >
          {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Create team
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-violet-300" />
          <h2 className="font-semibold">All teams</h2>
        </div>
        {teamsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading teams…
          </div>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {teams.map((team) => (
              <TeamRow key={team._id} team={team} allUsers={users} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
