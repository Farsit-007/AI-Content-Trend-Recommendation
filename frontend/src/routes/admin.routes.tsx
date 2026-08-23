import { Shield, Users, Building2, Database } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import { Admin, AdminCatalog, AdminTeams, AdminUsers } from './lazyPages';
import { teamAdminPaths } from './teamAdmin.routes';

/** super_admin gets everything a team admin has (which includes the member set), plus the
 *  role-guarded platform admin console.
 *  Team-scoped admin rights (a team's own team_admin) live in Team Settings instead — see
 *  TeamMembersSection — not here, since those never need a distinct global route. */
export const adminPaths: TUserPath[] = [
  ...teamAdminPaths,
  {
    name: 'Pipeline',
    path: 'admin/pipeline',
    element: <Admin />,
    icon: Shield,
    roles: ['super_admin'],
  },
  {
    name: 'Users',
    path: 'admin/users',
    element: <AdminUsers />,
    icon: Users,
    roles: ['super_admin'],
  },
  {
    name: 'Teams',
    path: 'admin/teams',
    element: <AdminTeams />,
    icon: Building2,
    roles: ['super_admin'],
  },
  {
    name: 'Catalog',
    path: 'admin/catalog',
    element: <AdminCatalog />,
    icon: Database,
    roles: ['super_admin'],
  },
];
