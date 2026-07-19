import type { AuthUser } from '@/lib/api/types';
import type { TUserPath } from '@/types';
import { userPaths } from './user.routes';
import { supperAdminPaths } from './supperAdmin.routes';

/** Resolve the dashboard path config for a role. Drives both routes and sidebar. Only two global
 *  tiers exist now — super_admin sees the full platform console; everyone else (including a
 *  team's own team_admin) gets the plain user set, since team-scoped admin rights are gated
 *  in-page (Team Settings), not by a distinct sidebar/route tier. */
export const getDashboardPaths = (role: AuthUser['role'] | undefined): TUserPath[] => {
  return role === 'super_admin' ? supperAdminPaths : userPaths;
};
