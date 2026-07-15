import type { AuthUser } from '@/lib/api/types';
import type { TUserPath } from '@/types';
import { userPaths } from './user.routes';
import { adminPaths } from './admin.routes';
import { supperAdminPaths } from './supperAdmin.routes';

/** Resolve the dashboard path config for a role. Drives both routes and sidebar. */
export const getDashboardPaths = (role: AuthUser['role'] | undefined): TUserPath[] => {
  switch (role) {
    case 'super_admin':
      return supperAdminPaths;
    case 'admin':
      return adminPaths;
    default:
      return userPaths;
  }
};
