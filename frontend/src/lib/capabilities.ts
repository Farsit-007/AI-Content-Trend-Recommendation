import type { AuthUser } from '@/lib/api/types';

/**
 * What a viewer is allowed to do, in one place.
 *
 * Before this, the UI asked `role === 'super_admin'` wherever it needed to decide something, and a
 * team's own admin was indistinguishable from a plain member — even though the backend enforces
 * different rights via `requireTeamAdmin`. Two problems with that: a permission change meant
 * hunting through components, and the UI could silently drift from what the API would actually
 * allow.
 *
 * Each capability below names the backend guard it mirrors, so the two can be checked against each
 * other by reading rather than by testing in production.
 */
export type Capability =
  /** requireSuperAdmin — the platform console: pipeline, users, teams, catalog, providers. */
  | 'platform.admin'
  /** requireTeamAdmin — edit this team's voice, subscriptions, and model overrides. */
  | 'team.manage'
  /** requireTeamAdmin — add/remove members of this team. */
  | 'team.members.manage'
  /** Any team member — read this team's own token/cost usage. */
  | 'team.usage.view'
  /** requireAuth — the everyday surfaces every member gets. */
  | 'content.create';

export interface Viewer {
  role: AuthUser['role'] | undefined;
  /** Teams where this viewer is the team admin. */
  teamAdminTeamIds: string[];
  /** The team currently in context, when one is selected. */
  activeTeamId?: string;
}

const isSuperAdmin = (viewer: Viewer): boolean => viewer.role === 'super_admin';

/**
 * A super admin passes team-scoped checks too. That is not a shortcut — it mirrors the backend,
 * where `requireTeamAdmin` short-circuits for `super_admin`. Diverging here would show a super admin
 * a disabled button for something the API would happily let them do.
 */
const isTeamAdminOfActiveTeam = (viewer: Viewer): boolean =>
  isSuperAdmin(viewer) ||
  (Boolean(viewer.activeTeamId) &&
    viewer.teamAdminTeamIds.includes(viewer.activeTeamId as string));

const RULES: Record<Capability, (viewer: Viewer) => boolean> = {
  'platform.admin': isSuperAdmin,
  'team.manage': isTeamAdminOfActiveTeam,
  'team.members.manage': isTeamAdminOfActiveTeam,
  'team.usage.view': (viewer) => Boolean(viewer.role),
  'content.create': (viewer) => Boolean(viewer.role),
};

export const can = (viewer: Viewer, capability: Capability): boolean => RULES[capability](viewer);
