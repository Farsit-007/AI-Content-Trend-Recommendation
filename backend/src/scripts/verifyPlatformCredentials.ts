/**
 * Proves a team's platform credential authenticates — nothing more.
 * Credentials are now team-owned (added via the frontend), not .env bootstrap tokens.
 *
 * Run: npm run verify:credentials -- <team_id>
 */
import mongoose from 'mongoose';
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
      return `https://www.googleapis.com/youtube/v3/channels?part=id&${
        config.platforms.youtube.accountId
          ? `id=${encodeURIComponent(config.platforms.youtube.accountId)}`
          : 'forHandle=@youtube'
      }&key=${encodeURIComponent(token)}`;
    case 'linkedin':
      return 'https://api.linkedin.com/v2/me';
  }
};

const verify = async (platform: KnownPlatform, teamId: string): Promise<{ outcome: Outcome; detail: string }> => {
  if (!(await isPlatformConfigured(platform, teamId))) {
    return {
      outcome: 'SKIP',
      detail: 'not configured (team has not added credentials for this platform)',
    };
  }

  const token = await getPlatformToken(platform, teamId);
  if (!token) {
    return { outcome: 'SKIP', detail: 'no credential found' };
  }

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
  const teamId = process.argv[2];
  if (!teamId) {
    console.error('Usage: npm run verify:credentials -- <team_id>');
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);
  console.log(`Verifying platform credentials for team: ${teamId}\n`);
  const results: Record<string, Outcome> = {};

  for (const platform of KNOWN_PLATFORMS) {
    const { outcome, detail } = await verify(platform, teamId);
    results[platform] = outcome;
    console.log(`  ${outcome.padEnd(4)} ${platform.padEnd(9)} ${detail}`);
  }

  await mongoose.disconnect();

  const failed = Object.entries(results).filter(([, outcome]) => outcome === 'FAIL');
  console.log(
    failed.length
      ? `\n${failed.length} platform(s) FAILED: ${failed.map(([p]) => p).join(', ')}`
      : '\nNo failures. (SKIP = team has not added credentials yet.)',
  );

  process.exit(failed.length ? 1 : 0);
};

main().catch((err) => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
