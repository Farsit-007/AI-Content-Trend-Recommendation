/**
 * Bootstraps the very first super_admin account. Necessary because public self-registration was
 * removed — a super_admin creates every other account, so something has to create the first one.
 * Calls `UserService.createUser` directly with no HTTP caller, which is what lets it create a
 * `super_admin` even though the escalation guard normally requires the caller to already be one.
 *
 * There's no "admin" role to bootstrap anymore — team-scoped admin rights are granted via team
 * membership (`team_admin`) once a super_admin has created the team, not at account-creation time.
 *
 * Run: npm run seed:admin -- <email> <password> <name>
 * (or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME instead of args)
 */
import mongoose from 'mongoose';
import config from '../app/config';
import { UserService } from '../app/modules/User/user.service';

const [, , argEmail, argPassword, argName] = process.argv;

const email = argEmail ?? process.env.SEED_ADMIN_EMAIL;
const password = argPassword ?? process.env.SEED_ADMIN_PASSWORD;
const name = argName ?? process.env.SEED_ADMIN_NAME;

const main = async () => {
  if (!email || !password || !name) {
    console.error('Usage: npm run seed:admin -- <email> <password> <name>');
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);

  const admin = await UserService.createUser({ email, password, name, role: 'super_admin' });
  console.log(`[seedAdmin] created super_admin ${admin.email} (${admin._id.toString()})`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[seedAdmin] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
