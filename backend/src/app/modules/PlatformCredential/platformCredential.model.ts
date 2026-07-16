import { Schema, model } from 'mongoose';
import { IPlatformCredential } from './platformCredential.interface';

const platformCredentialSchema = new Schema<IPlatformCredential>({
  team_id: { type: String, required: true },
  // Any social platform slug — not restricted to a fixed list, so a team can store credentials
  // for Reddit, Twitter/X, Instagram, TikTok, etc. in addition to the 3 with a bootstrap fallback.
  platform: { type: String, required: true, lowercase: true, trim: true },
  encrypted_token: { type: String, required: true, select: false },
  token_last4: { type: String, required: true },
  account_id: { type: String },
  added_by: { type: String, required: true },
  // --- OAuth fields (all optional; legacy rows added via the manual credential flow leave them unset) ---
  // 'page' = long-lived Meta Page token (no scheduled expiry), 'user' = long-lived user token,
  // 'api_key' = hand-pasted bootstrap token (the pre-OAuth default).
  token_type: { type: String, enum: ['page', 'user', 'api_key'], default: 'api_key' },
  // null/unset = no scheduled expiry (Page tokens). Set to `now` when a 190 marks the token dead.
  token_expires_at: { type: Date },
  // Granted scopes captured from debug_token at connect time.
  scopes: [{ type: String }],
  // FB Page id — present on both the facebook row and its linked instagram row.
  page_id: { type: String },
  // Page name / IG username, shown in the UI without decrypting anything.
  external_name: { type: String },
  // User id (our system) who ran the OAuth flow.
  connected_by: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// One stored credential per platform per team — resubmitting rotates it in place.
platformCredentialSchema.index({ team_id: 1, platform: 1 }, { unique: true });

export const PlatformCredential = model<IPlatformCredential>(
  'PlatformCredential',
  platformCredentialSchema,
  'platform_credentials',
);
