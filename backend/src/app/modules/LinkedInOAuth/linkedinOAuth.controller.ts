import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { LinkedInOAuthService } from './linkedinOAuth.service';

/**
 * teamId arrives via query/body here (not a route param), so `requireTeamAccess` can't gate it.
 * Mirror its rule: global admin/super_admin pass; everyone else must be a member of the team.
 */
const requireTeamId = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'teamId is required');
  }
  return raw;
};

const assertTeamAccess = (req: Request, teamId: string): void => {
  if (req.user?.role === 'admin' || req.user?.role === 'super_admin') return;
  if (!req.user?.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const connect = catchAsync(async (req: Request, res: Response) => {
  const teamId = requireTeamId(req.query.teamId);
  assertTeamAccess(req, teamId);
  const url = await LinkedInOAuthService.buildConnectUrl(teamId, req.user!.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LinkedIn connect URL generated',
    data: { url },
  });
});

const callback = catchAsync(async (req: Request, res: Response) => {
  const redirectUrl = await LinkedInOAuthService.handleCallback({
    code: req.query.code as string | undefined,
    state: req.query.state as string | undefined,
    error: req.query.error as string | undefined,
  });
  res.redirect(httpStatus.FOUND, redirectUrl);
});

const orgs = catchAsync(async (req: Request, res: Response) => {
  const teamId = requireTeamId(req.query.teamId);
  assertTeamAccess(req, teamId);
  const result = await LinkedInOAuthService.listPendingOrgs(teamId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pending LinkedIn organizations retrieved',
    data: result,
  });
});

const selectOrg = catchAsync(async (req: Request, res: Response) => {
  const { teamId, orgId } = req.body as { teamId: string; orgId: string };
  assertTeamAccess(req, teamId);
  const result = await LinkedInOAuthService.selectOrg(teamId, req.user!.id, orgId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LinkedIn organization connected',
    data: result,
  });
});

const disconnect = catchAsync(async (req: Request, res: Response) => {
  const teamId = requireTeamId(req.query.teamId);
  assertTeamAccess(req, teamId);
  await LinkedInOAuthService.disconnect(teamId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LinkedIn disconnected',
    data: { disconnected: true },
  });
});

export const LinkedInOAuthController = {
  connect,
  callback,
  orgs,
  selectOrg,
  disconnect,
};
