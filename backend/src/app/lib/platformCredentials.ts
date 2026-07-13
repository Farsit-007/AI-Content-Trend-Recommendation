import AppError from '../errors/AppError';
import { httpStatus } from '../utils/httpStatus';
import config from '../config';

export type Platform = 'facebook' | 'youtube' | 'linkedin';

export const PLATFORMS: Platform[] = ['facebook', 'youtube', 'linkedin'];

/**
 * The single accessor every analytics change uses to get a platform token.
 * Nothing downstream should read `process.env` or touch the credential collection directly.
 *
 * Resolution order (see design.md Decision #5):
 *   1. the given user's stored credential          (wired in task 5.5)
 *   2. the most recent active credential           (wired in task 5.5)
 *   3. the `.env` bootstrap token                  <- keeps analytics unblocked with zero users
 *   4. throw a typed, catchable "not connected"
 *
 * Step 3 is what lets `facebook-analytics` / `youtube-analytics` / `linkedin-analytics`
 * run against a cold database, before anyone has completed an OAuth flow.
 */
export const getPlatformToken = async (
  platform: Platform,
  // Part of the contract downstream analytics changes already import against; steps 1-2 of the
  // resolution order start reading it once the credential collection exists (task 5.5).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  userId?: string,
): Promise<string> => {
  const bootstrapToken = config.platforms[platform].bootstrapToken;
  if (bootstrapToken) {
    return bootstrapToken;
  }

  throw new AppError(
    httpStatus.FAILED_DEPENDENCY,
    `${platform} is not connected. Connect the account, or set its bootstrap token in .env.`,
  );
};

/** Whether a platform can currently be authenticated at all — lets callers degrade instead of throwing. */
export const isPlatformConfigured = (platform: Platform): boolean =>
  Boolean(config.platforms[platform].bootstrapToken);
