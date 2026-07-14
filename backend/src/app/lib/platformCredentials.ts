import { decrypt } from './crypto';
import { KnownPlatform, KNOWN_PLATFORMS, Platform } from './platforms';
import { PlatformCredential } from '../modules/PlatformCredential/platformCredential.model';
import { PlatformCatalogService } from '../modules/PlatformCatalog/platformCatalog.service';

export { Platform, KnownPlatform, KNOWN_PLATFORMS };

/**
 * Resolves a platform token from the team's own stored credential only.
 * Returns null when the team hasn't added credentials or the platform is disabled —
 * callers should treat null as "not connected" and degrade gracefully.
 *
 * No .env bootstrap fallback: credentials are team-owned, added via the frontend.
 */
export const getPlatformToken = async (platform: Platform, teamId: string): Promise<string | null> => {
  if (!(await PlatformCatalogService.isTeamPlatformEnabled(teamId, platform))) return null;

  const credential = await PlatformCredential.findOne({ team_id: teamId, platform }).select('+encrypted_token');
  return credential ? decrypt(credential.encrypted_token) : null;
};

/** Whether a team currently has a usable credential for a platform. */
export const isPlatformConfigured = async (platform: Platform, teamId: string): Promise<boolean> => {
  const token = await getPlatformToken(platform, teamId);
  return token !== null;
};
