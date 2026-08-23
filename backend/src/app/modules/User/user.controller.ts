import { Request, Response } from 'express';
import config from '../../config';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { UserService } from './user.service';

const REFRESH_COOKIE = 'refresh_token';

// '30d' / '12h' / '15m' / '45s' → milliseconds, for the cookie maxAge.
const durationToMs = (duration: string): number => {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return value * unit;
};

// SameSite=Lax covers localhost dev (5173 → backend port is same-site); production may serve
// the frontend from another domain, which needs None + Secure for the cookie to be sent.
const refreshCookieOptions = {
  httpOnly: true,
  secure: config.node_env === 'production',
  sameSite: config.node_env === 'production' ? ('none' as const) : ('lax' as const),
  path: '/api/v1/auth',
  maxAge: durationToMs(config.jwt_refresh_expires_in),
};

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions);

const createUser = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.createUser(req.body, req.user!.role);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'User created successfully',
    data: result,
  });
});

const listUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.listUsers(req.query.team_id as string | undefined);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Users retrieved successfully',
    data: result,
  });
});

const login = catchAsync(async (req: Request, res: Response) => {
  const { token, refresh_token, user } = await UserService.login(req.body);
  setRefreshCookie(res, refresh_token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logged in successfully',
    // refresh_token is also in the body for non-browser clients (Postman, scripts);
    // browsers should rely on the httpOnly cookie.
    data: { token, refresh_token, user },
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refresh_token;
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Refresh token is required');
  }

  const result = await UserService.refreshToken(token);
  setRefreshCookie(res, result.refresh_token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Token refreshed successfully',
    data: { token: result.token, refresh_token: result.refresh_token, user: result.user },
  });
});

// Access tokens are stateless JWTs, so logout = clearing the refresh cookie; the frontend
// drops its access token, which then simply ages out.
const logout = catchAsync(async (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logged out successfully',
    data: null,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.changePassword(req.user!.id, req.body);
  setRefreshCookie(res, result.refresh_token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password changed successfully',
    data: { token: result.token, refresh_token: result.refresh_token },
  });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const { reset_token } = await UserService.forgotPassword(req.body.email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'If an account exists for that email, a password reset token has been issued',
    data: reset_token ? { reset_token } : null,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await UserService.resetPassword(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password reset successfully',
    data: null,
  });
});

const getMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getMe(req.user!.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Current user retrieved successfully',
    data: result,
  });
});


const updateUser = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.updateUser(req.params.id as string, req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User updated successfully',
    data: result,
  });
});

const deleteUser = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.deleteUser(req.params.id as string, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User deleted successfully',
    data: result,
  });
});

export const UserController = {
  createUser,
  listUsers,
  login,
  refreshToken,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  updateUser,
  deleteUser,
};
