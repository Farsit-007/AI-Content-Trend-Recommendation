import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import AppError from '../errors/AppError';
import { IAuthPayload } from '../modules/User/user.interface';
import { User } from '../modules/User/user.model';
import { TeamService } from '../modules/Team/team.service';
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

  // The token can outlive the account it names, so confirm the user still exists, and read
  // role/team membership fresh from the DB rather than trusting the token — so a role change or
  // team removal takes effect on the very next request instead of waiting for token expiry.
  const user = await User.findById(payload.id);
  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid or expired token');
  }

  const team_ids = await TeamService.getTeamIdsForUser(user._id.toString());
  req.user = { id: user._id.toString(), email: user.email, role: user.role, team_ids };
  next();
});

/** Gate for admin-only routes. Must run after `requireAuth`. */
export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin') {
    throw new AppError(httpStatus.FORBIDDEN, 'Admin access required');
  }
  next();
};

/**
 * Gate for team-scoped routes, e.g. `/teams/:teamId/...`. Admins pass regardless of membership;
 * everyone else must be a member of the team named by `req.params[paramName]`. Must run after
 * `requireAuth`.
 */
export const requireTeamAccess =
  (paramName = 'teamId') =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role === 'admin') {
      return next();
    }

    const teamId = req.params[paramName] as string | undefined;
    if (!teamId || !req.user?.team_ids.includes(teamId)) {
      throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
    }
    next();
  };
