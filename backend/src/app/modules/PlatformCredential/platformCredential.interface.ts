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
  created_at: Date;
  updated_at: Date;
}
