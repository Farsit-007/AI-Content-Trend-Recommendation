import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../../config';
import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { TeamMembership } from '../Team/team.model';
import { TeamService } from '../Team/team.service';
import { IAuthPayload, UserRole } from './user.interface';
import { User } from './user.model';

const BCRYPT_COST = 10;

const signToken = (payload: IAuthPayload): string =>
  jwt.sign(payload, config.jwt_secret, {
    expiresIn: config.jwt_expires_in,
  } as SignOptions);

/**
 * Admin-only. Self-registration was removed — every account is created deliberately, with a
 * role and (usually) a team assignment, so there's never a user floating around with neither.
 */
const createUser = async (payload: {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  team_ids?: string[];
}) => {
  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) {
    throw new AppError(httpStatus.CONFLICT, 'An account with this email already exists');
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
    await TeamMembership.insertMany(teamIds.map((team_id) => ({ team_id, user_id: user._id })));
  }

  return user;
};

const listUsers = async (teamId?: string) => {
  if (!teamId) {
    return User.find();
  }
  const memberships = await TeamMembership.find({ team_id: teamId }).select('user_id');
  return User.find({ _id: { $in: memberships.map((m) => m.user_id) } });
};

const login = async (payload: { email: string; password: string }) => {
  const user = await User.findOne({ email: payload.email.toLowerCase() }).select('+password_hash');

  // Same error for "no such user" and "wrong password" — a differing response would let an
  // attacker enumerate which emails have accounts.
  const passwordMatches = user ? await bcrypt.compare(payload.password, user.password_hash) : false;
  if (!user || !passwordMatches) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid email or password');
  }

  const token = signToken({ id: user._id.toString(), email: user.email });
  return { token, user };
};

const getMe = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }
  const teamIds = await TeamService.getTeamIdsForUser(userId);
  return { user, team_ids: teamIds };
};

export const UserService = {
  createUser,
  listUsers,
  login,
  getMe,
};
