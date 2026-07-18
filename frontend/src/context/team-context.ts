import { createContext, useContext } from 'react';
import type { TeamDto } from '@/lib/api/teams';

export interface TeamContextValue {
  /** Resolved active team id: env override -> stored selection -> first membership -> undefined. */
  teamId: string | undefined;
  /** The user's visible teams (all teams for admin/super_admin, membership-scoped otherwise). */
  teams: TeamDto[];
  isLoading: boolean;
  setActiveTeam: (id: string) => void;
}

export const TeamContext = createContext<TeamContextValue | null>(null);

export function useTeamContext(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error('useTeamContext must be used within <TeamProvider>');
  }
  return ctx;
}
