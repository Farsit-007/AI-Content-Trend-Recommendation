import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import AppError from '../errors/AppError';
import { IAuthPayload } from '../modules/User/user.interface';
import { User } from '../modules/User/user.model';
import { catchAsync } from '../utils/catchAsync';
import { httpStatus } from '../utils/httpStatus';

export const requireAuth = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Authentication required');
  }

  let payload: IAuthPayload;
  try {
    payload = jwt.verify(header.slice('Bearer '.length), config.jwt_secret) as IAuthPayload;
  } catch {
    // Covers expired, malformed, and bad-signature tokens alike.
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid or expired token');
  }

  // The token can outlive the account it names, so confirm the user still exists.
  const user = await User.findById(payload.id);
  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid or expired token');
  }

  req.user = { id: user._id.toString(), email: user.email };
  next();
});
