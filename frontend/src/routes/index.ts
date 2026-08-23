import type { AuthUser } from '@/lib/api/types';
import type { TUserPath } from '@/types';
import { teamAdminPaths } from './teamAdmin.routes';
import { userPaths } from './user.routes';
import { superAdminPaths } from './superAdmin.routes';

/**
 * Resolve the dashboard path config for a viewer. Drives both routes and sidebar.
 *
 * Three tiers, not two. A team admin used to receive byte-identical navigation to a plain member
 * even though the backend grants it different rights via `requireTeamAdmin` — so the capability
 * existed and the UI simply never surfaced it. It now gets the member set plus the team-management
 * surfaces; super_admin still gets everything on top of that.
 */
export const getDashboardPaths = (
  role: AuthUser['role'] | undefined,
  isTeamAdmin = false,
): TUserPath[] => {
  if (role === 'super_admin') return superAdminPaths;
  return isTeamAdmin ? teamAdminPaths : userPaths;
};
