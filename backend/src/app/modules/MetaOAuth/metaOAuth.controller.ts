import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { MetaOAuthService } from './metaOAuth.service';

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
  const url = await MetaOAuthService.buildConnectUrl(teamId, req.user!.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Facebook connect URL generated',
    data: { url },
  });
});

const callback = catchAsync(async (req: Request, res: Response) => {
  const redirectUrl = await MetaOAuthService.handleCallback({
    code: req.query.code as string | undefined,
    state: req.query.state as string | undefined,
    error: req.query.error as string | undefined,
  });
  res.redirect(httpStatus.FOUND, redirectUrl);
});

const pages = catchAsync(async (req: Request, res: Response) => {
  const teamId = requireTeamId(req.query.teamId);
  assertTeamAccess(req, teamId);
  const result = await MetaOAuthService.listPendingPages(teamId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pending Facebook pages retrieved',
    data: result,
  });
});

const selectPage = catchAsync(async (req: Request, res: Response) => {
  const { teamId, pageId } = req.body as { teamId: string; pageId: string };
  assertTeamAccess(req, teamId);
  const result = await MetaOAuthService.selectPage(teamId, req.user!.id, pageId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Facebook page connected',
    data: result,
  });
});

const disconnect = catchAsync(async (req: Request, res: Response) => {
  const teamId = requireTeamId(req.query.teamId);
  assertTeamAccess(req, teamId);
  await MetaOAuthService.disconnect(teamId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Facebook disconnected',
    data: { disconnected: true },
  });
});

const dataDeletion = catchAsync(async (req: Request, res: Response) => {
  const signedRequest = (req.body as { signed_request?: string })?.signed_request ?? '';
  const result = await MetaOAuthService.handleDataDeletion(signedRequest);
  res.status(httpStatus.OK).json(result);
});

export const MetaOAuthController = {
  connect,
  callback,
  pages,
  selectPage,
  disconnect,
  dataDeletion,
};
