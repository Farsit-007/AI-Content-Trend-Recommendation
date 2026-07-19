import config from '../config';
import { logger } from './logger';
import { Team, TeamMembership } from '../modules/Team/team.model';
import { BrandVoiceExample } from '../modules/BrandVoiceExample/brandVoiceExample.model';
import { embedForTask } from './modelResolution';
import { User } from '../modules/User/user.model';
import { UserService } from '../modules/User/user.service';

/** Fixed, publicly-documented (non-production only) credentials — surfaced on the frontend
 *  login screen so a judge/reviewer can sign in as any role without provisioning anything.
 *  Both accounts are global `user`s — `admin` is this team's `team_admin`, `user` is a plain
 *  `member`; only `superadmin@gmail.com` (seedSuperAdminIfMissing) is a global `super_admin`. */
export const DEMO_ACCOUNTS = {
  admin: { email: 'demo.admin@growthstudio.dev', password: 'DemoAdmin123!', name: 'Demo Team Admin' },
  user: { email: 'demo.member@growthstudio.dev', password: 'DemoMember123!', name: 'Demo Member' },
} as const;

export const DEMO_TEAM_NAME = 'Growth Studio Demo Team';

// Under team-readiness gating, empty subscribed_categories makes the demo team "not ready" and
// defeats the point of a seeded demo — give it a real starting subscription.
const DEMO_SUBSCRIBED_CATEGORIES = ['AI', 'Web Dev'];

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
        subscribed_categories: DEMO_SUBSCRIBED_CATEGORIES,
        custom_categories: [],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const teamId = team._id.toString();

  // Backfill for a demo team seeded before team-readiness gating existed (subscribed_categories
  // was `[]` back then) — otherwise a pre-existing deployment's demo team stays permanently "not
  // ready" even though this seed considers itself done.
  if (team.subscribed_categories.length === 0) {
    await Team.updateOne({ _id: teamId }, { subscribed_categories: DEMO_SUBSCRIBED_CATEGORIES });
  }

  for (const [teamRole, account] of [
    ['team_admin', DEMO_ACCOUNTS.admin],
    ['member', DEMO_ACCOUNTS.user],
  ] as const) {
    const existing = await User.findOne({ email: account.email }).select('_id');
    if (!existing) {
      try {
        // team_ids intentionally omitted here — createUser's own membership insert has no way to
        // specify a per-team role, and this demo account's whole point is to demonstrate team_admin.
        const created = await UserService.createUser({ ...account, role: 'user' });
        await TeamMembership.create({ team_id: teamId, user_id: created._id, role: teamRole });
        logger.info(`[seedDemoAccounts] created demo ${teamRole} ${created.email} on team "${DEMO_TEAM_NAME}" (${teamId})`);
      } catch (err) {
        // A concurrent boot can win the create race between our findOne and this insert — the
        // DB's unique index on email rejects the loser. That's success from this function's
        // point of view (the account now exists), not a failure.
        logger.info({ err: err instanceof Error ? err.message : err }, `[seedDemoAccounts] ${teamRole} creation skipped — likely already created concurrently`);
      }
      continue;
    }

    // Backfill for an account whose User document exists but whose membership row doesn't (e.g.
    // seeded before this team existed, or lost to a partial earlier failure) — otherwise this demo
    // account is permanently teamless even though this seed considers itself done.
    const hasMembership = await TeamMembership.exists({ team_id: teamId, user_id: existing._id });
    if (!hasMembership) {
      await TeamMembership.create({ team_id: teamId, user_id: existing._id, role: teamRole });
      logger.info(`[seedDemoAccounts] backfilled missing ${teamRole} membership for ${account.email} on team "${DEMO_TEAM_NAME}"`);
    }
  }

  const hasExamples = await BrandVoiceExample.exists({ team_id: teamId });
  if (hasExamples) return;

  try {
    for (const example of DEMO_BRAND_VOICE_EXAMPLES) {
      const embedding = await embedForTask('embedding', example.content);
      await BrandVoiceExample.create({ team_id: teamId, ...example, embedding });
    }
    logger.info('[seedDemoAccounts] seeded demo brand-voice examples');
  } catch (err) {
    // Non-fatal: the demo team just stays in "cold start" (neutral-voice generation) if this
    // fails, e.g. the LLM provider is unreachable at boot. Never blocks server startup.
    logger.warn({ err }, '[seedDemoAccounts] failed to seed demo brand-voice examples — continuing');
  }
};
