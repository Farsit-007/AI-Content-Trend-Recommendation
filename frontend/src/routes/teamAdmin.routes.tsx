import { Gauge } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import { Usage } from './lazyPages';
import { userPaths } from './user.routes';

/**
 * A team's own admin: everything a member has, plus what `requireTeamAdmin` already lets them do.
 *
 * This tier existed on the backend and nowhere in the UI — a team admin saw exactly a member's
 * navigation. Usage is the first surface that is genuinely theirs: spend is a team-management
 * concern, and a member has no reason to look at it. Team Settings stays in the shared set because
 * members read it too; the *editing* controls inside it are gated by `useCan('team.manage')`.
 */
export const teamAdminPaths: TUserPath[] = [
  ...userPaths,
  { name: 'AI usage', path: 'usage', element: <Usage />, icon: Gauge },
];
