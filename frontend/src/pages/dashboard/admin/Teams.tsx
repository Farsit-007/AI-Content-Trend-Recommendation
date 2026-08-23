import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Building2,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';

import {
  addTeamMember,
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  removeTeamMember,
  setTeamMemberRole,
  updateTeam,
  type TeamDto,
  type TeamMemberRole,
} from '@/lib/api/teams';
import { listUsers } from '@/lib/api/users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/dashboard/StatCard';
import { FormDialog } from '@/components/dashboard/FormDialog';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const teamSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required'),
  description: z.string().trim().optional(),
});

type TeamValues = z.infer<typeof teamSchema>;

/**
 * The roster editor. Lives in a sheet rather than an inline expanding row: the roster is a
 * second, independently-fetched resource, and a side panel keeps the team list on screen
 * while you move people around.
 */
function MembersSheet({
  team,
  open,
  onOpenChange,
}: {
  team: TeamDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [addingUserId, setAddingUserId] = useState('');
  const teamId = team?._id;

  const detailQuery = useQuery({
    queryKey: ['team-detail', teamId],
    queryFn: () => getTeam(teamId as string),
    enabled: Boolean(teamId) && open,
  });

  const usersQuery = useQuery({ queryKey: ['users', 'all'], queryFn: () => listUsers() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['team-detail', teamId] });
    queryClient.invalidateQueries({ queryKey: ['teams', 'all'] });
  };

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => addTeamMember(teamId as string, userId),
    onSuccess: () => {
      toast.success('Member added');
      setAddingUserId('');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId as string, userId),
    onSuccess: () => {
      toast.success('Member removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove member'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TeamMemberRole }) =>
      setTeamMemberRole(teamId as string, userId, role),
    onSuccess: (_result, { role }) => {
      toast.success(role === 'team_admin' ? 'Promoted to team admin' : 'Demoted to member');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update role'),
  });

  const members = detailQuery.data?.members ?? [];
  const memberIds = new Set(members.map((member) => member._id));
  const availableUsers = (usersQuery.data ?? []).filter((user) => !memberIds.has(user._id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UsersIcon className="size-4 text-brand" />
            {team?.name ?? 'Roster'}
          </SheetTitle>
          <SheetDescription>
            Add or remove people, and decide who administers this team.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {detailQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No members yet"
              description="Add someone below to get this team working."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((member) => {
                const isTeamAdmin = member.team_role === 'team_admin';
                const roleBusy =
                  roleMutation.isPending && roleMutation.variables?.userId === member._id;
                const removeBusy =
                  removeMemberMutation.isPending && removeMemberMutation.variables === member._id;
                return (
                  <li
                    key={member._id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {member.name}
                        {isTeamAdmin && (
                          <Badge variant="brand">
                            <ShieldCheck />
                            Team admin
                          </Badge>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        disabled={roleBusy}
                        onClick={() =>
                          roleMutation.mutate({
                            userId: member._id,
                            role: isTeamAdmin ? 'member' : 'team_admin',
                          })
                        }
                      >
                        {roleBusy && <Loader2 className="size-3 animate-spin" />}
                        {isTeamAdmin ? 'Demote' : 'Make admin'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={'Remove ' + member.name + ' from team'}
                        disabled={removeBusy}
                        onClick={() => removeMemberMutation.mutate(member._id)}
                      >
                        <UserMinus className="size-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <SheetFooter className="border-t border-border">
          {availableUsers.length > 0 ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              <Select value={addingUserId} onValueChange={setAddingUserId}>
                <SelectTrigger className="min-w-0 flex-1" aria-label="Choose someone to add">
                  <SelectValue placeholder="Add a member" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                className="gap-1.5"
                disabled={!addingUserId || addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate(addingUserId)}
              >
                {addMemberMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserPlus className="size-3.5" />
                )}
                Add
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Everyone with an account is already on this team.
            </p>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminTeams() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TeamDto | null>(null);
  const [rosterTeam, setRosterTeam] = useState<TeamDto | null>(null);
  const [deleting, setDeleting] = useState<TeamDto | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [teamAdminId, setTeamAdminId] = useState<string>('');

  const teamsQuery = useQuery({ queryKey: ['teams', 'all'], queryFn: listTeams });
  const usersQuery = useQuery({ queryKey: ['users', 'all'], queryFn: () => listUsers() });
  const teams = teamsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const createForm = useForm<TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: '', description: '' },
  });

  const editForm = useForm<TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: '', description: '' },
  });

  const resetCreate = () => {
    createForm.reset();
    setMemberIds([]);
    setTeamAdminId('');
  };

  const createMutation = useMutation({
    mutationFn: createTeam,
    onSuccess: (created) => {
      toast.success('Team "' + created.name + '" created');
      resetCreate();
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['teams', 'all'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create team'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TeamValues }) =>
      updateTeam(id, { name: values.name.trim(), description: values.description?.trim() || '' }),
    onSuccess: () => {
      toast.success('Team updated');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['teams', 'all'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update team'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: (deleted) => {
      toast.success('Deleted "' + deleted.name + '"');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['teams', 'all'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete team'),
  });

  const toggleMember = (id: string) =>
    setMemberIds((prev) => {
      const next = prev.includes(id) ? prev.filter((memberId) => memberId !== id) : [...prev, id];
      // A team_admin pick that is no longer a selected member cannot stay the team_admin.
      if (teamAdminId === id && !next.includes(id)) setTeamAdminId('');
      return next;
    });

  const openEdit = (team: TeamDto) => {
    editForm.reset({ name: team.name, description: team.description ?? '' });
    setEditing(team);
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Team ID copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const columns = useMemo<DataTableColumn<TeamDto>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Team',
        sortFn: 'text',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.name}</span>
            {row.original.description && (
              <span className="truncate text-xs text-muted-foreground">
                {row.original.description}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'subscribed',
        header: 'Subscriptions',
        enableSorting: false,
        cell: ({ row }) => {
          const count = row.original.subscribed_categories?.length ?? 0;
          return count === 0 ? (
            <Badge variant="outline">None yet</Badge>
          ) : (
            <Badge variant="brand">
              {count} {count === 1 ? 'category' : 'categories'}
            </Badge>
          );
        },
      },
      {
        id: 'custom',
        header: 'Custom categories',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.custom_categories?.length ?? 0}
          </span>
        ),
      },
      {
        id: 'voice',
        header: 'Voice',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.voice_profile?.default_language ? (
            <Badge variant="muted">{row.original.voice_profile.default_language}</Badge>
          ) : (
            <span className="text-muted-foreground">Default</span>
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
              <Button variant="ghost" size="icon-sm" aria-label="Team actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="truncate">{row.original.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setRosterTeam(row.original)}>
                <UsersIcon />
                Manage members
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openEdit(row.original)}>
                <Pencil />
                Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copyId(row.original._id)}>
                <Copy />
                Copy team ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 />
                Delete team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const selectableAdmins = users.filter((user) => memberIds.includes(user._id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        accent="Team"
        title="management"
        icon={Building2}
        guideKey="teams"
        description="Stand up new teams and manage any roster — a super admin can edit any team, including ones they do not belong to."
        actions={
          <Button
            data-tour="teams-create"
            className="btn-glow gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            New team
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Building2} label="Teams" value={teams.length} accent="brand" />
        <StatCard icon={UsersIcon} label="Accounts" value={users.length} accent="info" />
        <StatCard
          icon={ShieldCheck}
          label="Teams with subscriptions"
          value={teams.filter((team) => (team.subscribed_categories?.length ?? 0) > 0).length}
          accent="opportunity"
        />
      </div>

      <section className="glass-card rounded-xl p-5">
        <DataTable
          data={teams}
          columns={columns}
          getRowId={(row) => row._id}
          isLoading={teamsQuery.isLoading}
          isFetching={teamsQuery.isFetching}
          error={teamsQuery.error}
          onRetry={() => teamsQuery.refetch()}
          search={{ value: search, onChange: setSearch, placeholder: 'Search teams' }}
          minWidth={720}
          pageSize={25}
          onRowClick={(row) => setRosterTeam(row)}
          emptyState={
            <EmptyState
              icon={Building2}
              title="No teams yet"
              description="A team owns its own feed subscriptions, brand voice, and drafts."
              action={
                <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  New team
                </Button>
              }
            />
          }
          renderMobileCard={(row) => (
            <div className="flex flex-col gap-1.5">
              <p className="font-medium">{row.name}</p>
              {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="brand">{row.subscribed_categories?.length ?? 0} subscribed</Badge>
                <Badge variant="muted">{row.custom_categories?.length ?? 0} custom</Badge>
              </div>
            </div>
          )}
        />
      </section>

      <MembersSheet
        team={rosterTeam}
        open={Boolean(rosterTeam)}
        onOpenChange={(open) => !open && setRosterTeam(null)}
      />

      <FormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreate();
        }}
        title="Create a team"
        description="Name it, then optionally staff it right away."
        icon={Plus}
        form={createForm}
        isPending={createMutation.isPending}
        submitLabel="Create team"
        onSubmit={(values) =>
          createMutation.mutate({
            name: values.name.trim(),
            description: values.description?.trim() || undefined,
            member_ids: memberIds,
            team_admin_id: teamAdminId || undefined,
          })
        }
      >
        <FormField
          control={createForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team name</FormLabel>
              <FormControl>
                <Input placeholder="Growth" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Input placeholder="What this team publishes" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {users.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Starting members (optional)</Label>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {users.map((user) => (
                <label
                  key={user._id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    checked={memberIds.includes(user._id)}
                    onCheckedChange={() => toggleMember(user._id)}
                  />
                  <span className="truncate">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {selectableAdmins.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Team admin (optional)</Label>
            <Select value={teamAdminId} onValueChange={setTeamAdminId}>
              <SelectTrigger aria-label="Choose the team admin">
                <SelectValue placeholder="Everyone joins as a plain member" />
              </SelectTrigger>
              <SelectContent>
                {selectableAdmins.map((user) => (
                  <SelectItem key={user._id} value={user._id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Must be one of the starting members chosen above.
            </p>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit team"
        description="Renaming a team does not affect its roster, drafts, or subscriptions."
        icon={Pencil}
        form={editForm}
        isPending={updateMutation.isPending}
        submitLabel="Save changes"
        onSubmit={(values) => {
          if (!editing) return;
          updateMutation.mutate({ id: editing._id, values });
        }}
      >
        <FormField
          control={editForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={editForm.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="What this team publishes" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={'Delete team "' + (deleting?.name ?? '') + '"?'}
        description="This removes its roster. Drafts and brand-voice examples are not cascade-deleted."
        confirmLabel="Delete team"
        onConfirm={() => deleting && deleteMutation.mutate(deleting._id)}
      />
    </div>
  );
}
