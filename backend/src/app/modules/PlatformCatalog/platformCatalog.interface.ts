import { Platform } from '../../lib/platforms';

/** The super_admin-curated list of platforms that exist in the system at all. */
export interface IPlatformCatalog {
  name: Platform;
  label?: string;
  is_enabled: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/** A team's own on/off switch for one catalog platform. */
export interface ITeamPlatform {
  team_id: string;
  platform: Platform;
  is_enabled: boolean;
  enabled_by: string;
  created_at: Date;
  updated_at: Date;
}
