import { useTeamContext } from '@/context/team-context';

/**
 * Resolves the team id the dashboard operates on. Backed by `TeamProvider`
 * (env override -> stored selection -> first membership), so every page using
 * this hook picks up the team switcher for free.
 */
export function useTeamId(): string | undefined {
  return useTeamContext().teamId;
}
