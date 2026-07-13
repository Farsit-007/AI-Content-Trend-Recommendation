/**
 * Bootstraps the very first admin account. Necessary because public self-registration
 * was removed — every user is created by an admin, so something has to create the first one.
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

  const admin = await UserService.createUser({ email, password, name, role: 'admin' });
  console.log(`[seedAdmin] created admin ${admin.email} (${admin._id.toString()})`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[seedAdmin] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
