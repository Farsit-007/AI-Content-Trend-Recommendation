import { useAuth } from '@/context/auth-context';

/**
 * Resolves the team id the dashboard operates on. There is no team switcher yet, so we take
 * `VITE_DEFAULT_TEAM_ID` when set, otherwise the user's first team membership.
 */
export function useTeamId(): string | undefined {
  const { user } = useAuth();
  const fromEnv = import.meta.env.VITE_DEFAULT_TEAM_ID as string | undefined;
  return fromEnv || user?.team_ids?.[0];
}
