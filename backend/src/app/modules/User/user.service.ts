import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../../config';
import AppError from '../../errors/AppError';
import { httpStatus } from '../../utils/httpStatus';
import { IAuthPayload } from './user.interface';
import { User } from './user.model';

const BCRYPT_COST = 10;

const signToken = (payload: IAuthPayload): string =>
  jwt.sign(payload, config.jwt_secret, {
    expiresIn: config.jwt_expires_in,
  } as SignOptions);

const register = async (payload: { email: string; password: string; name: string }) => {
  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) {
    throw new AppError(httpStatus.CONFLICT, 'An account with this email already exists');
  }

  const password_hash = await bcrypt.hash(payload.password, BCRYPT_COST);
  const user = await User.create({
    email: payload.email.toLowerCase(),
    password_hash,
    name: payload.name,
  });

  return user;
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
  return user;
};

export const UserService = {
  register,
  login,
  getMe,
};
