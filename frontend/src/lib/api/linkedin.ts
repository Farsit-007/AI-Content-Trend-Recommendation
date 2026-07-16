import { apiDelete, apiGet, apiPost } from './client';

/** A pending LinkedIn organization the user administers (tokens never leave the backend). */
export interface PendingOrg {
  id: string;
  name: string;
  vanity_name?: string;
}

/** Step 1 — get the LinkedIn consent URL to open in a popup. */
export const getLinkedInConnectUrl = (teamId: string): Promise<{ url: string }> =>
  apiGet<{ url: string }>('/oauth/linkedin/connect', { params: { teamId } });

/** Step 4a — list the organizations awaiting selection after the OAuth round-trip. */
export const listPendingOrgs = (teamId: string): Promise<PendingOrg[]> =>
  apiGet<PendingOrg[]>('/oauth/linkedin/orgs', { params: { teamId } });

/** Step 4b — persist the chosen organization and kick an immediate refresh. */
export const selectOrg = (teamId: string, orgId: string): Promise<{ organization: string }> =>
  apiPost<{ organization: string }>('/oauth/linkedin/select-org', { teamId, orgId });

/** Disconnect LinkedIn for the team. */
export const disconnectLinkedIn = (teamId: string): Promise<{ disconnected: boolean }> =>
  apiDelete<{ disconnected: boolean }>('/oauth/linkedin', { params: { teamId } });
