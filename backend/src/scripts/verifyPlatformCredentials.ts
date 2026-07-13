/**
 * Proves a platform credential *authenticates* — nothing more.
 *
 * Deliberately calls only cheap, read-only identity endpoints, never the insights/analytics
 * endpoints: those belong to facebook-analytics / youtube-analytics / linkedin-analytics.
 * The only question this script answers is "does this token work?".
 *
 * Run: npm run verify:credentials
 */
import {
  getPlatformToken,
  isPlatformConfigured,
  KNOWN_PLATFORMS,
  KnownPlatform,
} from '../app/lib/platformCredentials';
import config from '../app/config';

type Outcome = 'PASS' | 'FAIL' | 'SKIP';

const identityUrl = (platform: KnownPlatform, token: string): string => {
  switch (platform) {
    case 'facebook':
      return `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    case 'youtube':
      // The bootstrap YouTube credential is an API key, not an OAuth token, so it goes in the
      // query string. A channel id makes this a valid lookup without needing OAuth's `mine=true`.
      return `https://www.googleapis.com/youtube/v3/channels?part=id&${
        config.platforms.youtube.accountId
          ? `id=${encodeURIComponent(config.platforms.youtube.accountId)}`
          : 'forHandle=@youtube'
      }&key=${encodeURIComponent(token)}`;
    case 'linkedin':
      return 'https://api.linkedin.com/v2/me';
  }
};

const verify = async (platform: KnownPlatform): Promise<{ outcome: Outcome; detail: string }> => {
  if (!(await isPlatformConfigured(platform))) {
    return {
      outcome: 'SKIP',
      detail: 'not configured (no stored credential, no bootstrap token in .env)',
    };
  }

  const token = await getPlatformToken(platform);
  const headers: Record<string, string> =
    platform === 'linkedin' ? { Authorization: `Bearer ${token}` } : {};

  try {
    const res = await fetch(identityUrl(platform, token), { headers });
    const body = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const providerError = JSON.stringify(body.error ?? body);
      return { outcome: 'FAIL', detail: `HTTP ${res.status} — ${providerError}` };
    }

    return { outcome: 'PASS', detail: `authenticated as ${JSON.stringify(body.name ?? body.id ?? body)}` };
  } catch (err) {
    return { outcome: 'FAIL', detail: (err as Error).message };
  }
};

const main = async () => {
  console.log('Verifying platform credentials...\n');
  const results: Record<string, Outcome> = {};

  for (const platform of KNOWN_PLATFORMS) {
    const { outcome, detail } = await verify(platform);
    results[platform] = outcome;
    console.log(`  ${outcome.padEnd(4)} ${platform.padEnd(9)} ${detail}`);
  }

  // A SKIP is an acceptable outcome (LinkedIn approval may never arrive — requirements §5.6).
  // Only a real FAIL — a token that exists but is rejected — is worth a non-zero exit.
  const failed = Object.entries(results).filter(([, outcome]) => outcome === 'FAIL');
  console.log(
    failed.length
      ? `\n${failed.length} platform(s) FAILED: ${failed.map(([p]) => p).join(', ')}`
      : '\nNo failures. (SKIP = not configured yet, which is expected until tokens land.)',
  );

  process.exit(failed.length ? 1 : 0);
};

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
