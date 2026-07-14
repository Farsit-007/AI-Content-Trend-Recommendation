import config from '../config';
import { User } from '../modules/User/user.model';
import { UserService } from '../modules/User/user.service';

/**
 * Ensures the `SUPER_ADMIN_EMAIL` account exists as a `super_admin` every time the server boots —
 * idempotent, so it's safe to run on every restart. A no-op (with a log line) if the env vars
 * aren't set, or if an account with that email already exists (its role/password are never
 * touched here, so this never silently overwrites something an admin changed by hand).
 *
 * This is the automatic counterpart to `npm run seed:admin` — that script stays for creating
 * *additional* admins/super_admins on demand; this one guarantees the very first super_admin
 * always exists without anyone having to remember to run a script.
 */
export const seedSuperAdminIfMissing = async (): Promise<void> => {
  const { email, password, name } = config.super_admin;

  if (!email || !password) {
    console.log('[seedSuperAdmin] SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set — skipping');
    return;
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`[seedSuperAdmin] ${email} already exists — skipping`);
    return;
  }

  const superAdmin = await UserService.createUser({
    email,
    password,
    name: name ?? 'Super Admin',
    role: 'super_admin',
  });
  console.log(`[seedSuperAdmin] created super_admin ${superAdmin.email} (${superAdmin._id.toString()})`);
};
