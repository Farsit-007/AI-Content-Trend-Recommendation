import AppError from '../errors/AppError';
import { httpStatus } from '../utils/httpStatus';
import config from '../config';
import { decrypt } from './crypto';
import { isKnownPlatform, KNOWN_PLATFORMS, KnownPlatform, Platform } from './platforms';
import { PlatformCredential } from '../modules/PlatformCredential/platformCredential.model';

export { Platform, KnownPlatform, KNOWN_PLATFORMS };

const findStoredToken = async (platform: Platform, teamId?: string): Promise<string | null> => {
  if (!teamId) return null;
  const credential = await PlatformCredential.findOne({ team_id: teamId, platform }).select('+encrypted_token');
  return credential ? decrypt(credential.encrypted_token) : null;
};

/** Only the 3 platforms with a fixed `.env` var have a bootstrap fallback — anything else a team adds has none. */
const getBootstrapToken = (platform: Platform): string | undefined =>
  isKnownPlatform(platform) ? config.platforms[platform].bootstrapToken : undefined;

/**
 * The single accessor every analytics change uses to get a platform token.
 * Nothing downstream should read `process.env` or touch the credential collection directly.
 *
 * Resolution order:
 *   1. the given team's stored credential (encrypted at rest, decrypted here)
 *   2. the `.env` bootstrap token, for the 3 known platforms only <- keeps analytics unblocked
 *      with zero teams configured
 *   3. throw a typed, catchable "not connected"
 *
 * Step 2 is what lets `facebook-analytics` / `youtube-analytics` / `linkedin-analytics`
 * run against a cold database, before any team has submitted its own credential.
 */
export const getPlatformToken = async (platform: Platform, teamId?: string): Promise<string> => {
  const storedToken = await findStoredToken(platform, teamId);
  if (storedToken) {
    return storedToken;
  }

  const bootstrapToken = getBootstrapToken(platform);
  if (bootstrapToken) {
    return bootstrapToken;
  }

  throw new AppError(
    httpStatus.FAILED_DEPENDENCY,
    `${platform} is not connected. Connect the account, or set its bootstrap token in .env.`,
  );
};

/** Whether a platform can currently be authenticated at all — lets callers degrade instead of throwing. */
export const isPlatformConfigured = async (platform: Platform, teamId?: string): Promise<boolean> => {
  if (await findStoredToken(platform, teamId)) return true;
  return Boolean(getBootstrapToken(platform));
};
