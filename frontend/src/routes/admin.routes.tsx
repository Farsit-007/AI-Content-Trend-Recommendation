import { Shield, Users, Building2, Database } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import Admin from '@/pages/dashboard/Admin';
import AdminUsers from '@/pages/dashboard/admin/Users';
import AdminTeams from '@/pages/dashboard/admin/Teams';
import AdminCatalog from '@/pages/dashboard/admin/Catalog';
import { userPaths } from './user.routes';

/** Admins get everything a user has, plus the role-guarded admin console. */
export const adminPaths: TUserPath[] = [
  ...userPaths,
  {
    name: 'Pipeline',
    path: 'admin/pipeline',
    element: <Admin />,
    icon: Shield,
    roles: ['admin', 'super_admin'],
  },
  {
    name: 'Users',
    path: 'admin/users',
    element: <AdminUsers />,
    icon: Users,
    roles: ['admin', 'super_admin'],
  },
  {
    name: 'Teams',
    path: 'admin/teams',
    element: <AdminTeams />,
    icon: Building2,
    roles: ['admin', 'super_admin'],
  },
  {
    name: 'Catalog',
    path: 'admin/catalog',
    element: <AdminCatalog />,
    icon: Database,
    roles: ['admin', 'super_admin'],
  },
];
