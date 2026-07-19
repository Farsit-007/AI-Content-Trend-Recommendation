/**
 * One-time, idempotent fixup for accounts created under the old three-tier role model
 * (`super_admin`/`admin`/`user`) before the `admin` tier was replaced by per-team `team_admin`
 * membership (team-roles-rework). Every check here is a no-op once the DB has already been
 * migrated, so this is safe to leave permanently in the boot sequence rather than a run-once script.
 */
import { logger } from './logger';
import { Team, TeamMembership } from '../modules/Team/team.model';
import { User } from '../modules/User/user.model';
import { DEMO_ACCOUNTS, DEMO_TEAM_NAME } from './seedDemoAccounts';

/** Mongoose's `role` path is typed to the current `UserRole` union, but a document persisted under
 *  the old schema can still carry the now-removed `'admin'` string at rest — these two casts are
 *  the only places that legacy value is ever referenced. */
const LEGACY_ADMIN_ROLE = 'admin' as unknown as 'super_admin';

export const migrateLegacyRolesIfNeeded = async (): Promise<void> => {
  // The demo "admin" account's intent shifted from a global tier to this specific team's
  // team_admin — special-cased by email since, unlike every other legacy admin, its meaning
  // changed rather than just its label.
  const demoAdmin = await User.findOne({ email: DEMO_ACCOUNTS.admin.email });
  if (demoAdmin && demoAdmin.role === LEGACY_ADMIN_ROLE) {
    demoAdmin.role = 'user';
    await demoAdmin.save();

    const team = await Team.findOne({ name: DEMO_TEAM_NAME }).select('_id');
    if (team) {
      await TeamMembership.findOneAndUpdate(
        { team_id: team._id.toString(), user_id: demoAdmin._id },
        { role: 'team_admin' },
        { upsert: true },
      );
    }
    logger.info('[migrateLegacyRoles] migrated demo admin account to user + team_admin');
  }

  // Every other legacy global `admin` keeps equivalent (bypass-every-team) access under the new
  // two-tier model rather than being silently demoted to a plain member.
  const result = await User.updateMany({ role: LEGACY_ADMIN_ROLE }, { role: 'super_admin' });
  if (result.modifiedCount > 0) {
    logger.info(`[migrateLegacyRoles] promoted ${result.modifiedCount} legacy 'admin' user(s) to 'super_admin'`);
  }
};
