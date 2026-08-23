import { useAuth } from '@/context/auth-context';
import { useTeamId } from '@/lib/useTeamId';
import { can, type Capability, type Viewer } from '@/lib/capabilities';

/**
 * Permission check for the current viewer and the team currently in context.
 *
 * A hook rather than a bare function so callers cannot forget to pass the active team — a
 * team-scoped capability evaluated without one silently answers `false`, which looks like "you may
 * not" instead of "we did not ask properly".
 */
export const useCan = (): ((capability: Capability) => boolean) => {
  const { user } = useAuth();
  const activeTeamId = useTeamId();

  const viewer: Viewer = {
    role: user?.role,
    teamAdminTeamIds: user?.team_admin_team_ids ?? [],
    activeTeamId: activeTeamId ?? undefined,
  };

  return (capability: Capability) => can(viewer, capability);
};
