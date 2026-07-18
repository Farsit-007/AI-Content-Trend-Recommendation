import config from '../config';
import { logger } from './logger';
import { Team } from '../modules/Team/team.model';
import { BrandVoiceExample } from '../modules/BrandVoiceExample/brandVoiceExample.model';
import { embed } from './embeddings';
import { User } from '../modules/User/user.model';
import { UserService } from '../modules/User/user.service';

/** Fixed, publicly-documented (non-production only) credentials — surfaced on the frontend
 *  login screen so a judge/reviewer can sign in as any role without provisioning anything. */
export const DEMO_ACCOUNTS = {
  admin: { email: 'demo.admin@growthstudio.dev', password: 'DemoAdmin123!', name: 'Demo Admin' },
  user: { email: 'demo.member@growthstudio.dev', password: 'DemoMember123!', name: 'Demo Member' },
} as const;

const DEMO_TEAM_NAME = 'Growth Studio Demo Team';

const DEMO_BRAND_VOICE_EXAMPLES: { content: string; platform: 'facebook' | 'linkedin' }[] = [
  {
    platform: 'facebook',
    content:
      "Big news for anyone building with AI this week — we broke down what it actually means for your workflow, no hype, just the practical stuff. Drop a comment if you want the full rundown 👇",
  },
  {
    platform: 'linkedin',
    content:
      'A quick take on where the industry is heading: the teams that win are the ones who ship fast and learn faster. Here is what we changed on our end after seeing this trend — and why it is worth your team’s attention too.',
  },
];

/**
 * Idempotently seeds a demo team + one demo `admin` and one demo `user`, pre-loaded with a
 * couple of brand-voice examples so Generate never hits the "cold start" (zero examples)
 * path on a first-run demo. Non-production only — this never touches a real deployment,
 * and is safe to leave permanently enabled in dev/staging (skips instantly once seeded).
 *
 * Every step below is independently idempotent (upsert or existence-checked), rather than
 * gated by one top-level "does the admin exist" check — `ts-node-dev --respawn` restarts on
 * every save, so a single coarse gate is a real race: two overlapping boots can each see
 * "not created yet" and double-create the team. Re-running this after a partial prior
 * failure (e.g. the LLM being unreachable) also converges instead of erroring.
 *
 * This is the hackathon-judging counterpart to `seedSuperAdminIfMissing`: that seeds the one
 * operator account from env vars; this seeds two fixed, documented accounts (surfaced on the
 * login screen) so every role can be exercised in under a minute with zero setup.
 */
export const seedDemoAccountsIfMissing = async (): Promise<void> => {
  if (config.node_env === 'production') {
    logger.info('[seedDemoAccounts] production environment — skipping demo account seed');
    return;
  }

  // Atomic upsert — safe under concurrent boots, unlike a separate findOne-then-create.
  const team = await Team.findOneAndUpdate(
    { name: DEMO_TEAM_NAME },
    {
      $setOnInsert: {
        name: DEMO_TEAM_NAME,
        description: 'Seeded demo team — safe sandbox for exploring every Growth Studio feature.',
        created_by: 'system',
        subscribed_categories: [],
        custom_categories: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const teamId = team._id.toString();

  for (const [role, account] of [
    ['admin', DEMO_ACCOUNTS.admin],
    ['user', DEMO_ACCOUNTS.user],
  ] as const) {
    const exists = await User.findOne({ email: account.email }).select('_id');
    if (exists) continue;
    try {
      const created = await UserService.createUser({ ...account, role, team_ids: [teamId] });
      logger.info(`[seedDemoAccounts] created demo ${role} ${created.email} on team "${DEMO_TEAM_NAME}" (${teamId})`);
    } catch (err) {
      // A concurrent boot can win the create race between our findOne and this insert — the
      // DB's unique index on email rejects the loser. That's success from this function's
      // point of view (the account now exists), not a failure.
      logger.info({ err: err instanceof Error ? err.message : err }, `[seedDemoAccounts] ${role} creation skipped — likely already created concurrently`);
    }
  }

  const hasExamples = await BrandVoiceExample.exists({ team_id: teamId });
  if (hasExamples) return;

  try {
    for (const example of DEMO_BRAND_VOICE_EXAMPLES) {
      const embedding = await embed(example.content);
      await BrandVoiceExample.create({ team_id: teamId, ...example, embedding });
    }
    logger.info('[seedDemoAccounts] seeded demo brand-voice examples');
  } catch (err) {
    // Non-fatal: the demo team just stays in "cold start" (neutral-voice generation) if this
    // fails, e.g. the LLM provider is unreachable at boot. Never blocks server startup.
    logger.warn({ err }, '[seedDemoAccounts] failed to seed demo brand-voice examples — continuing');
  }
};
