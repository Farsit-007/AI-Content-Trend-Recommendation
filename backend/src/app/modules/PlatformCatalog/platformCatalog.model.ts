import { Schema, model } from 'mongoose';
import { IPlatformCatalog, ITeamPlatform } from './platformCatalog.interface';

const platformCatalogSchema = new Schema<IPlatformCatalog>({
  name: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, trim: true },
  is_enabled: { type: Boolean, default: true },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

platformCatalogSchema.index({ name: 1 }, { unique: true });

export const PlatformCatalog = model<IPlatformCatalog>(
  'PlatformCatalog',
  platformCatalogSchema,
  'platform_catalog',
);

const teamPlatformSchema = new Schema<ITeamPlatform>({
  team_id: { type: String, required: true },
  platform: { type: String, required: true, lowercase: true, trim: true },
  is_enabled: { type: Boolean, default: true },
  enabled_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// One switch per (team, platform) — re-enabling/disabling flips this row rather than duplicating it.
teamPlatformSchema.index({ team_id: 1, platform: 1 }, { unique: true });

export const TeamPlatform = model<ITeamPlatform>('TeamPlatform', teamPlatformSchema, 'team_platforms');
