import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../../config';
import AppError from '../../errors/AppError';
import { logger } from '../../lib/logger';
import { ActivityLogService } from '../ActivityLog/activityLog.service';
import { PLATFORM_SCOPE } from '../ActivityLog/activityLog.interface';
import { isMailConfigured, sendPasswordResetMail } from '../../lib/mailer';
import { httpStatus } from '../../utils/httpStatus';
import { TeamMembership } from '../Team/team.model';
import { TeamService } from '../Team/team.service';
import { IAuthPayload, IRequestUser, UserRole } from './user.interface';
import { User } from './user.model';

const BCRYPT_COST = 10;

const signAccessToken = (payload: Pick<IAuthPayload, 'id' | 'email'>): string =>
  jwt.sign({ ...payload, token_type: 'access' }, config.jwt_secret, {
    expiresIn: config.jwt_expires_in,
  } as SignOptions);

const signRefreshToken = (
  payload: Pick<IAuthPayload, 'id' | 'email'>,
): string =>
  jwt.sign({ ...payload, token_type: 'refresh' }, config.jwt_refresh_secret, {
    expiresIn: config.jwt_refresh_expires_in,
  } as SignOptions);

/**
 * True when the token was issued before the user's last password change — such tokens are
 * dead. Backdated 1s on write (see changePassword) so a token issued in the same second as
 * the change itself stays valid.
 */
const issuedBeforePasswordChange = (
  user: { password_changed_at?: Date },
  iat?: number,
): boolean => {
  if (!user.password_changed_at || typeof iat !== 'number') return false;
  // iat has whole-second granularity; keep the change time fractional so the 1s backdate
  // isn't rounded away (flooring both sides would let a just-invalidated token survive).
  return iat < user.password_changed_at.getTime() / 1000;
};

/**
 * Admin-only. Self-registration was removed — every account is created deliberately, with a
 * role and (usually) a team assignment, so there's never a user floating around with neither.
 *
 * `requestingUserRole` is the HTTP caller's own role, used to block a regular admin from
 * creating/promoting another super_admin. It's omitted entirely when called from the
 * `seedAdmin` bootstrap script (no HTTP caller exists yet), which is what lets that script
 * create the very first super_admin.
 */
const createUser = async (
  payload: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    team_ids?: string[];
  },
  requestingUserRole?: UserRole,
) => {
  if (
    payload.role === 'super_admin' &&
    requestingUserRole &&
    requestingUserRole !== 'super_admin'
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only a super_admin can create another super_admin',
    );
  }

  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) {
    throw new AppError(
      httpStatus.CONFLICT,
      'An account with this email already exists',
    );
  }

  const password_hash = await bcrypt.hash(payload.password, BCRYPT_COST);
  const user = await User.create({
    email: payload.email.toLowerCase(),
    password_hash,
    name: payload.name,
    role: payload.role ?? 'user',
  });

  const teamIds = payload.team_ids ?? [];
  if (teamIds.length) {
    await TeamMembership.insertMany(
      teamIds.map((team_id) => ({ team_id, user_id: user._id })),
    );
  }

  return user;
};

const listUsers = async (teamId?: string) => {
  if (!teamId) {
    return User.find();
  }
  const memberships = await TeamMembership.find({ team_id: teamId }).select(
    'user_id',
  );
  return User.find({ _id: { $in: memberships.map((m) => m.user_id) } });
};

const login = async (payload: { email: string; password: string }) => {
  const user = await User.findOne({
    email: payload.email.toLowerCase(),
  }).select('+password_hash');

  // Same error for "no such user" and "wrong password" — a differing response would let an
  // attacker enumerate which emails have accounts.
  const passwordMatches = user
    ? await bcrypt.compare(payload.password, user.password_hash)
    : false;
  if (!user || !passwordMatches) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid email or password');
  }

  const tokenPayload = { id: user._id.toString(), email: user.email };
  return {
    token: signAccessToken(tokenPayload),
    refresh_token: signRefreshToken(tokenPayload),
    user,
  };
};

/**
 * Exchanges a valid refresh token for a fresh access token (and a rotated refresh token).
 * Rejects access tokens passed here, deleted users, and refresh tokens issued before the
 * user's last password change.
 */
const refreshToken = async (token: string) => {
  let payload: IAuthPayload;
  try {
    payload = jwt.verify(token, config.jwt_refresh_secret) as IAuthPayload;
  } catch {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired refresh token',
    );
  }

  if (payload.token_type !== 'refresh') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired refresh token',
    );
  }

  const user = await User.findById(payload.id);
  if (!user || issuedBeforePasswordChange(user, payload.iat)) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired refresh token',
    );
  }

  const tokenPayload = { id: user._id.toString(), email: user.email };
  return {
    token: signAccessToken(tokenPayload),
    refresh_token: signRefreshToken(tokenPayload),
    user,
  };
};

const changePassword = async (
  userId: string,
  payload: { old_password: string; new_password: string },
) => {
  const user = await User.findById(userId).select('+password_hash');
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const matches = await bcrypt.compare(
    payload.old_password,
    user.password_hash,
  );
  if (!matches) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Current password is incorrect',
    );
  }

  user.password_hash = await bcrypt.hash(payload.new_password, BCRYPT_COST);
  // Backdate 1s so tokens issued in this same second (e.g. the response's fresh pair) survive.
  user.password_changed_at = new Date(Date.now() - 1000);
  await user.save();

  // Every previously issued token is now dead — hand back a fresh pair so the frontend
  // can keep the session alive without forcing a re-login.
  const tokenPayload = { id: user._id.toString(), email: user.email };
  return {
    token: signAccessToken(tokenPayload),
    refresh_token: signRefreshToken(tokenPayload),
  };
};

/**
 * Issues a 15-minute reset token and emails the link.
 *
 * The response message is identical whether or not the email has an account — no enumeration. The
 * token is still returned in the body outside production so frontend development doesn't need a
 * working mailbox, but that is a convenience, not the delivery mechanism: with SMTP configured the
 * link is emailed, and production returns nothing in the body either way.
 *
 * When SMTP is *not* configured this degrades to the previous behavior — log the token for an
 * operator to relay — rather than failing the request, so a deployment that hasn't set SMTP_* yet
 * keeps working exactly as it did. The `error` level is deliberate: in production that line means a
 * real user asked to reset their password and nothing was delivered, which someone needs to see.
 */
const forgotPassword = async (email: string) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return { reset_token: undefined };
  }

  const reset_token = jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      token_type: 'password_reset',
    },
    config.jwt_secret,
    { expiresIn: '15m' },
  );

  const delivered = await sendPasswordResetMail(
    user.email,
    reset_token,
    user.name,
  );
  if (!delivered) {
    const message = isMailConfigured()
      ? 'Password reset token issued but the email failed to send — relay it manually'
      : 'Password reset token issued but SMTP is not configured — no email was sent, relay it manually';
    logger.error({ email: user.email, reset_token }, message);
  } else {
    logger.info({ email: user.email }, 'Password reset email sent');
  }

  return {
    reset_token: config.node_env !== 'production' ? reset_token : undefined,
  };
};

const resetPassword = async (payload: {
  token: string;
  new_password: string;
}) => {
  let tokenPayload: IAuthPayload;
  try {
    tokenPayload = jwt.verify(payload.token, config.jwt_secret) as IAuthPayload;
  } catch {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired reset token',
    );
  }

  if (tokenPayload.token_type !== 'password_reset') {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired reset token',
    );
  }

  const user = await User.findById(tokenPayload.id);
  // The password_changed_at check makes reset tokens single-use: once the password changes,
  // any reset token issued earlier (including this one) is rejected.
  if (!user || issuedBeforePasswordChange(user, tokenPayload.iat)) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired reset token',
    );
  }

  user.password_hash = await bcrypt.hash(payload.new_password, BCRYPT_COST);
  user.password_changed_at = new Date(Date.now() - 1000);
  await user.save();
};

const getMe = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }
  // `team_admin_team_ids` is the subset of `team_ids` where this user is the team's admin. The
  // middleware has always computed it for `requireTeamAdmin`, but it never reached the client — so
  // the frontend had no way to distinguish a team admin from a member and showed both the identical
  // navigation, even though the backend enforces different rights.
  const [teamIds, teamAdminTeamIds] = await Promise.all([
    TeamService.getTeamIdsForUser(userId),
    TeamService.getTeamAdminTeamIdsForUser(userId),
  ]);
  return { user, team_ids: teamIds, team_admin_team_ids: teamAdminTeamIds };
};

/**
 * Neither of the two mutations below may leave the platform without a super admin.
 *
 * That is not a theoretical concern: super_admin is the only tier that can create users or manage
 * providers, so losing the last one locks everybody out of administering the deployment with no
 * in-app way back — recovery would mean editing the database by hand.
 */
const assertNotLastSuperAdmin = async (userId: string): Promise<void> => {
  const target = await User.findById(userId).select('role');
  if (target?.role !== 'super_admin') return;

  const remaining = await User.countDocuments({
    role: 'super_admin',
    _id: { $ne: userId },
  });
  if (remaining === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This is the last super admin — promote another user first, or the platform becomes unadministrable.',
    );
  }
};

const updateUser = async (
  userId: string,
  payload: { name?: string; role?: UserRole },
  requestingUser: IRequestUser,
) => {
  if (payload.role && payload.role !== 'super_admin') {
    await assertNotLastSuperAdmin(userId);
  }

  const user = await User.findByIdAndUpdate(userId, payload, {
    new: true,
    runValidators: true,
  });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  void ActivityLogService.recordActivity({
    team_id: PLATFORM_SCOPE,
    actor: requestingUser,
    action: 'user.updated',
    summary: `Updated ${user.email} (${Object.keys(payload).join(', ')})`,
    target_type: 'user',
    target_id: userId,
  });

  return user;
};

const deleteUser = async (userId: string, requestingUser: IRequestUser) => {
  // Deleting yourself is always a mistake and sometimes an unrecoverable one — you would lose the
  // session mid-request with no account to sign back in with.
  if (userId === requestingUser.id) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You cannot delete your own account',
    );
  }
  await assertNotLastSuperAdmin(userId);

  const user = await User.findByIdAndDelete(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Memberships would otherwise linger and keep listing a deleted user as a team member.
  await TeamMembership.deleteMany({ user_id: userId });

  void ActivityLogService.recordActivity({
    team_id: PLATFORM_SCOPE,
    actor: requestingUser,
    action: 'user.deleted',
    summary: `Deleted ${user.email}`,
    target_type: 'user',
    target_id: userId,
  });

  return user;
};

export const UserService = {
  createUser,
  listUsers,
  login,
  refreshToken,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  updateUser,
  deleteUser,
};
