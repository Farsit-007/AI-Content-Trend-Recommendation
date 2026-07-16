import { apiDelete, apiGet, apiPost } from './client';

/** Stored platform credential metadata (the encrypted token is never returned). */
export interface TeamCredential {
  platform: string;
  account_id?: string;
  token_type?: 'page' | 'user' | 'api_key';
  token_expires_at?: string | null;
  page_id?: string;
  external_name?: string;
  connected_by?: string;
  updated_at?: string;
}

/** List the team's stored credentials (metadata only). */
export const listTeamCredentials = (teamId: string): Promise<TeamCredential[]> =>
  apiGet<TeamCredential[]>(`/teams/${teamId}/credentials`);

/** A pending Facebook page candidate the user can pick (tokens never leave the backend). */
export interface PendingPage {
  id: string;
  name: string;
  picture?: string;
  ig_linked: boolean;
  ig_username?: string;
}

/** Step 1 — get the Meta consent URL to open in a popup. */
export const getFacebookConnectUrl = (teamId: string): Promise<{ url: string }> =>
  apiGet<{ url: string }>('/oauth/facebook/connect', { params: { teamId } });

/** Step 4a — list the pages awaiting selection after the OAuth round-trip. */
export const listPendingPages = (teamId: string): Promise<PendingPage[]> =>
  apiGet<PendingPage[]>('/oauth/facebook/pages', { params: { teamId } });

/** Step 4b — persist the chosen page (+ linked IG) and kick an immediate refresh. */
export const selectPage = (teamId: string, pageId: string): Promise<{ page: string; instagram: boolean }> =>
  apiPost<{ page: string; instagram: boolean }>('/oauth/facebook/select-page', { teamId, pageId });

/** Disconnect Facebook + Instagram for the team. */
export const disconnectFacebook = (teamId: string): Promise<{ disconnected: boolean }> =>
  apiDelete<{ disconnected: boolean }>('/oauth/facebook', { params: { teamId } });
