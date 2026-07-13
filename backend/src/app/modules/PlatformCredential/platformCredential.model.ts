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
