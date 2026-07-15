import { Shield } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import Admin from '@/pages/dashboard/Admin';
import { userPaths } from './user.routes';

/** Admins get everything a user has, plus the role-guarded Admin section. */
export const adminPaths: TUserPath[] = [
  ...userPaths,
  {
    name: 'Admin',
    path: 'admin',
    element: <Admin />,
    icon: Shield,
    roles: ['admin', 'super_admin'],
  },
];
