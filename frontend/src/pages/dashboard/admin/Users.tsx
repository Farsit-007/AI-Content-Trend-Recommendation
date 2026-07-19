import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, UserPlus, Users as UsersIcon } from 'lucide-react';
import { createUser, listUsers, type UserDto } from '@/lib/api/users';
import { listTeams } from '@/lib/api/teams';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHelp } from '@/components/dashboard/PageHelp';

type RoleOption = 'user' | 'super_admin';

const ROLE_CHIP: Record<string, string> = {
  super_admin: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-400',
  user: 'border-border bg-muted text-muted-foreground',
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  user: 'Member',
};

export default function AdminUsers() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const queryClient = useQueryClient();

  const [teamFilter, setTeamFilter] = useState<string>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleOption>('user');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const teamsQuery = useQuery({ queryKey: ['teams', 'all'], queryFn: listTeams });
  const teams = teamsQuery.data ?? [];

  const usersQuery = useQuery({
    queryKey: ['users', teamFilter],
    queryFn: () => listUsers(teamFilter || undefined),
  });
  const users = usersQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (created) => {
      toast.success(`Account created for ${created.email}`);
      setEmail('');
      setPassword('');
      setName('');
      setRole('user');
      setSelectedTeamIds([]);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create account'),
  });

  const toggleTeam = (id: string) => {
    setSelectedTeamIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const handleCreate = () => {
    if (!email.trim() || !password.trim() || !name.trim()) {
      toast.error('Email, password, and name are required');
      return;
    }
    createMutation.mutate({
      email: email.trim(),
      password,
      name: name.trim(),
      role,
      team_ids: selectedTeamIds.length ? selectedTeamIds : undefined,
    });
  };

  const teamName = (id: string) => teams.find((t) => t._id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            <span className="gradient-text">User</span> accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            There's no self-registration in Growth Studio — every account is created deliberately, here.
          </p>
        </div>
        <PageHelp guideKey="users" />
      </div>

      <section data-tour="users-create" className="glass-card flex flex-col gap-4 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-violet-700 dark:text-violet-300" />
          <h2 className="font-semibold">Create an account</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Temporary password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleOption)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="user" className="bg-background text-foreground">
              Member
            </option>
            {isSuperAdmin && (
              <option value="super_admin" className="bg-background text-foreground">
                Super Admin
              </option>
            )}
          </select>
        </div>

        {teams.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Assign to teams (optional) — as a plain member; promote to team admin from Team Settings.
            </span>
            <div className="flex flex-wrap gap-1.5">
              {teams.map((team) => {
                const active = selectedTeamIds.includes(team._id);
                return (
                  <button
                    key={team._id}
                    type="button"
                    onClick={() => toggleTeam(team._id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition',
                      active
                        ? 'border-violet-400/50 bg-violet-400/15 text-violet-800 dark:text-violet-200'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {team.name}
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
          className="btn-glow w-fit gap-2"
        >
          {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Create account
        </Button>
      </section>

      <section className="glass-card flex flex-col gap-4 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UsersIcon className="size-4 text-violet-700 dark:text-violet-300" />
            <h2 className="font-semibold">All accounts</h2>
          </div>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="" className="bg-background text-foreground">
              Every team
            </option>
            {teams.map((team) => (
              <option key={team._id} value={team._id} className="bg-background text-foreground">
                {team.name}
              </option>
            ))}
          </select>
        </div>

        {usersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading accounts…
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: UserDto) => (
                  <tr key={u._id} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-4 text-sm font-medium">{u.name}</td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">{u.email}</td>
                    <td className="py-3 pr-4">
                      <span className={cn('rounded-full border px-2 py-0.5 text-xs', ROLE_CHIP[u.role])}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {teamFilter && (
          <p className="text-xs text-muted-foreground">Filtered to {teamName(teamFilter)}.</p>
        )}
      </section>
    </div>
  );
}
