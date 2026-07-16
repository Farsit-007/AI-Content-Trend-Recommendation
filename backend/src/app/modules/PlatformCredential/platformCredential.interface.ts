import { Platform } from '../../lib/platforms';

export interface IPlatformCredential {
  team_id: string;
  platform: Platform;
  encrypted_token: string;
  // Last 4 characters of the plaintext token, kept alongside the ciphertext purely so the list
  // view can show `••••1234` without decrypting on every read.
  token_last4: string;
  account_id?: string;
  added_by: string;
  // OAuth metadata — all optional so existing rows and the manual credential flow are unaffected.
  token_type?: 'page' | 'user' | 'api_key';
  token_expires_at?: Date;
  scopes?: string[];
  page_id?: string;
  external_name?: string;
  connected_by?: string;
  created_at: Date;
  updated_at: Date;
}
