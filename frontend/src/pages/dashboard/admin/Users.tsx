import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Copy, MoreHorizontal, ShieldCheck, UserPlus, Users as UsersIcon } from 'lucide-react';

import { createUser, listUsers, type UserDto } from '@/lib/api/users';
import { listTeams } from '@/lib/api/teams';
import { useAuth } from '@/context/auth-context';
import { timeAgo } from '@/lib/datetime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatCard } from '@/components/dashboard/StatCard';
import { FormDialog } from '@/components/dashboard/FormDialog';
import { PageHeader } from '@/components/dashboard/PageHeader';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  user: 'Member',
};

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
  role: z.enum(['user', 'super_admin']),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

export default function AdminUsers() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const queryClient = useQueryClient();

  const [teamFilter, setTeamFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const teamsQuery = useQuery({ queryKey: ['teams', 'all'], queryFn: listTeams });
  const teams = teamsQuery.data ?? [];

  const usersQuery = useQuery({
    queryKey: ['users', teamFilter],
    queryFn: () => listUsers(teamFilter === 'all' ? undefined : teamFilter),
  });
  const users = usersQuery.data ?? [];

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'user' },
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (created) => {
      toast.success('Account created for ' + created.email);
      form.reset();
      setSelectedTeamIds([]);
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create account'),
  });

  const toggleTeam = (id: string) =>
    setSelectedTeamIds((prev) =>
      prev.includes(id) ? prev.filter((teamId) => teamId !== id) : [...prev, id],
    );

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label + ' copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const adminCount = users.filter((u) => u.role === 'super_admin').length;

  const columns = useMemo<DataTableColumn<UserDto>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        sortFn: 'text',
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar>
              <AvatarFallback>{initials(row.original.name)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        sortFn: 'text',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: 'Role',
        sortFn: 'text',
        cell: ({ row }) => (
          <Badge variant={row.original.role === 'super_admin' ? 'trend' : 'muted'}>
            {row.original.role === 'super_admin' && <ShieldCheck />}
            {ROLE_LABEL[row.original.role] ?? row.original.role}
          </Badge>
        ),
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        sortFn: 'datetime',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{timeAgo(row.original.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        meta: { className: 'w-0', label: 'Actions' },
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="truncate">{row.original.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => copy(row.original.email, 'Email')}>
                <Copy />
                Copy email
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copy(row.original._id, 'User ID')}>
                <Copy />
                Copy user ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        accent="User"
        title="accounts"
        icon={UsersIcon}
        guideKey="users"
        description="There is no self-registration in Growth Studio — every account is created deliberately, here."
        actions={
          <Button
            data-tour="users-create"
            className="btn-glow gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus />
            New account
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={UsersIcon} label="Accounts" value={users.length} accent="brand" />
        <StatCard icon={ShieldCheck} label="Super admins" value={adminCount} accent="trend" />
        <StatCard icon={UsersIcon} label="Teams" value={teams.length} accent="info" />
      </div>

      <section className="glass-card flex flex-col gap-4 rounded-xl p-5">
        <DataTable
          data={users}
          columns={columns}
          getRowId={(row) => row._id}
          isLoading={usersQuery.isLoading}
          isFetching={usersQuery.isFetching}
          error={usersQuery.error}
          onRetry={() => usersQuery.refetch()}
          search={{ value: search, onChange: setSearch, placeholder: 'Search name or email' }}
          minWidth={640}
          pageSize={25}
          emptyState={
            <EmptyState
              icon={UsersIcon}
              title="No accounts match"
              description={
                teamFilter === 'all'
                  ? 'Create the first account to get started.'
                  : 'This team has no members yet — assign one from Team settings.'
              }
              action={
                <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
                  <UserPlus />
                  New account
                </Button>
              }
            />
          }
          toolbar={
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger size="sm" className="w-[190px]" aria-label="Filter by team">
                <SelectValue placeholder="Every team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every team</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team._id} value={team._id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          renderMobileCard={(row) => (
            <div className="flex items-start gap-3">
              <Avatar>
                <AvatarFallback>{initials(row.name)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate font-medium">{row.name}</p>
                <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={row.role === 'super_admin' ? 'trend' : 'muted'}>
                    {ROLE_LABEL[row.role] ?? row.role}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</span>
                </div>
              </div>
            </div>
          )}
        />
        <p className="text-xs text-muted-foreground">
          Accounts are create-and-read here: the API exposes no update or delete for a user, so
          role changes happen per team from Team settings.
        </p>
      </section>

      <FormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            form.reset();
            setSelectedTeamIds([]);
          }
        }}
        title="Create an account"
        description="The person gets this email and temporary password to sign in."
        icon={UserPlus}
        form={form}
        isPending={createMutation.isPending}
        submitLabel="Create account"
        onSubmit={(values) =>
          createMutation.mutate({
            email: values.email.trim(),
            password: values.password,
            name: values.name.trim(),
            role: values.role,
            team_ids: selectedTeamIds.length ? selectedTeamIds : undefined,
          })
        }
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input placeholder="Ada Lovelace" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <Input type="email" placeholder="ada@example.com" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Temporary password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="user">Member</SelectItem>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {teams.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Starting teams (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Joins as a plain member — promote to team admin from Team settings.
            </p>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {teams.map((team) => (
                <label
                  key={team._id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    checked={selectedTeamIds.includes(team._id)}
                    onCheckedChange={() => toggleTeam(team._id)}
                  />
                  <span className="truncate">{team.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </FormDialog>
    </div>
  );
}
