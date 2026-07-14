import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { getTeamAnalytics, runAnalyticsRefresh } from './analytics.service';

const refresh = catchAsync(async (req: Request, res: Response) => {
  const teamId = (req.body as { team_id?: string })?.team_id;
  const summary = await runAnalyticsRefresh(teamId ? { teamId } : undefined);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Analytics refresh complete',
    data: summary,
  });
});

const getAnalytics = catchAsync(async (req: Request, res: Response) => {
  const teamId = req.query.team_id as string;
  const result = await getTeamAnalytics(teamId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Analytics retrieved successfully',
    data: result,
  });
});

export const AnalyticsController = {
  refresh,
  getAnalytics,
};
