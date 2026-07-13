/**
 * Bootstraps the very first admin (or super_admin) account. Necessary because public
 * self-registration was removed — every user is created by an admin, so something has to
 * create the first one. Calls `UserService.createUser` directly with no HTTP caller, which is
 * what lets it create a `super_admin` even though the escalation guard normally requires the
 * caller to already be one.
 *
 * Run: npm run seed:admin -- <email> <password> <name> [role]
 * (or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME / SEED_ADMIN_ROLE instead of args)
 * `role` defaults to "admin"; pass "super_admin" to bootstrap the platform-catalog owner.
 */
import mongoose from 'mongoose';
import config from '../app/config';
import { UserRole } from '../app/modules/User/user.interface';
import { UserService } from '../app/modules/User/user.service';

const [, , argEmail, argPassword, argName, argRole] = process.argv;

const email = argEmail ?? process.env.SEED_ADMIN_EMAIL;
const password = argPassword ?? process.env.SEED_ADMIN_PASSWORD;
const name = argName ?? process.env.SEED_ADMIN_NAME;
const role = (argRole ?? process.env.SEED_ADMIN_ROLE ?? 'admin') as UserRole;

const main = async () => {
  if (!email || !password || !name) {
    console.error('Usage: npm run seed:admin -- <email> <password> <name> [role]');
    process.exit(1);
  }
  if (role !== 'admin' && role !== 'super_admin') {
    console.error(`Invalid role "${role}" — must be "admin" or "super_admin"`);
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);

  const admin = await UserService.createUser({ email, password, name, role });
  console.log(`[seedAdmin] created ${role} ${admin.email} (${admin._id.toString()})`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[seedAdmin] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
