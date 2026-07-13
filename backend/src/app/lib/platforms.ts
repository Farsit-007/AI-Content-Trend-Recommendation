/**
 * A team's platform credential can be for any social platform — Facebook, YouTube, LinkedIn,
 * Reddit, Twitter/X, Instagram, TikTok, or anything else a team happens to use. Stored as a
 * lowercase slug (validated in `platformCredential.validation.ts`); nothing in the credential
 * store itself is hardcoded to a fixed platform list.
 */
export type Platform = string;

/**
 * The subset of platforms that have a first-class analytics integration and an `.env` bootstrap
 * token fallback (see `config.platforms` and `getPlatformToken`). Any other platform a team adds
 * simply has no bootstrap fallback — its credential must come from the stored, team-submitted one.
 */
export type KnownPlatform = 'facebook' | 'youtube' | 'linkedin';

export const KNOWN_PLATFORMS: KnownPlatform[] = ['facebook', 'youtube', 'linkedin'];

export const isKnownPlatform = (platform: string): platform is KnownPlatform =>
  (KNOWN_PLATFORMS as string[]).includes(platform);
