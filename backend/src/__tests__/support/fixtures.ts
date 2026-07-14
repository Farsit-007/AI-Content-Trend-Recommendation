import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../../app/config';
import { UserRole } from '../../app/modules/User/user.interface';
import { User } from '../../app/modules/User/user.model';
import { Team, TeamMembership } from '../../app/modules/Team/team.model';
import { PlatformCatalog, TeamPlatform } from '../../app/modules/PlatformCatalog/platformCatalog.model';

export const TEST_PASSWORD = 'Password123!';

// Low bcrypt cost keeps the suite fast — this is test-only, never production data.
const TEST_BCRYPT_COST = 4;

let counter = 0;
const uniqueEmail = () => `user-${Date.now()}-${counter++}@example.test`;

export const createTestUser = async (
  overrides: { email?: string; role?: UserRole; name?: string; password?: string } = {},
) => {
  const password = overrides.password ?? TEST_PASSWORD;
  const password_hash = await bcrypt.hash(password, TEST_BCRYPT_COST);
  return User.create({
    email: overrides.email ?? uniqueEmail(),
    password_hash,
    name: overrides.name ?? 'Test User',
    role: overrides.role ?? 'user',
  });
};

export const createAuthToken = (user: { _id: unknown; email: string }): string =>
  jwt.sign({ id: (user._id as { toString(): string }).toString(), email: user.email }, config.jwt_secret, {
    expiresIn: config.jwt_expires_in,
  } as SignOptions);

export const createTestTeam = async (overrides: { name?: string; createdBy?: string } = {}) =>
  Team.create({
    name: overrides.name ?? 'Test Team',
    created_by: overrides.createdBy ?? 'test-seed',
  });

export const addTeamMember = async (teamId: string, userId: string) =>
  TeamMembership.create({ team_id: teamId, user_id: userId });

/** A valid 1536-dimension embedding vector — matches `NewsItem.embedding`'s schema validator. */
export const testEmbedding = (): number[] => Array(1536).fill(0.01);

/** Enables a platform both globally (catalog) and for a specific team, satisfying `assertTeamPlatformEnabled`. */
export const enablePlatformForTeam = async (teamId: string, platform: string, enabledBy: string) => {
  await PlatformCatalog.create({ name: platform, is_enabled: true, created_by: enabledBy });
  await TeamPlatform.create({ team_id: teamId, platform, is_enabled: true, enabled_by: enabledBy });
};
