import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { listTeams } from '@/lib/api/teams';
import { TeamContext, type TeamContextValue } from './team-context';

const STORAGE_KEY = 'growth-studio-team-id';

/** `VITE_DEFAULT_TEAM_ID`, when set, always wins — single-team demo/deploy convenience. */
const envTeamId = import.meta.env.VITE_DEFAULT_TEAM_ID as string | undefined;

function getStoredTeamId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem(STORAGE_KEY) ?? undefined;
}

/**
 * Resolves and persists the active team, replacing the old env-or-first-membership-only
 * logic in `useTeamId`. Resolution order: env override -> stored selection (validated
 * against the fetched team list) -> first membership -> first visible team -> undefined.
 */
export function TeamProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [storedTeamId, setStoredTeamId] = useState<string | undefined>(getStoredTeamId);

  const teamsQuery = useQuery({
    queryKey: ['teams', 'all'],
    queryFn: listTeams,
    enabled: isAuthenticated,
  });
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);

  const setActiveTeam = (id: string) => {
    setStoredTeamId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const teamId = useMemo(() => {
    if (envTeamId) return envTeamId;
    if (storedTeamId && teams.some((t) => t._id === storedTeamId)) return storedTeamId;
    if (user?.team_ids?.[0]) return user.team_ids[0];
    return teams[0]?._id;
  }, [storedTeamId, teams, user]);

  // A stored id that's no longer in the fetched team list (deleted team, removed member) is a
  // routine reconciliation, not an error: quietly persist the fallback `teamId` for next load.
  // No React state changes here — `teamId` above already re-derives correctly every render
  // regardless, this just keeps localStorage in sync as an external system. Skipped while an env
  // override is active, since that shouldn't overwrite the user's real selection.
  useEffect(() => {
    if (envTeamId || !teamsQuery.isSuccess || !teamId) return;
    if (storedTeamId && !teams.some((t) => t._id === storedTeamId)) {
      localStorage.setItem(STORAGE_KEY, teamId);
    }
  }, [teamsQuery.isSuccess, teams, teamId, storedTeamId]);

  const value: TeamContextValue = {
    teamId,
    teams,
    isLoading: teamsQuery.isLoading,
    setActiveTeam,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}
