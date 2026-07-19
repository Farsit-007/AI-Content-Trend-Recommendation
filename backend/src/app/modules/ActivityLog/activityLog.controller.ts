import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { ActivityLogService } from './activityLog.service';

const getActivityLog = catchAsync(async (req: Request, res: Response) => {
  const { team_id, action, page, limit } = req.query as Record<string, string | undefined>;
  const { meta, result } = await ActivityLogService.listActivity(team_id as string, { action, page, limit }, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Activity log retrieved successfully',
    meta,
    data: result,
  });
});

export const ActivityLogController = {
  getActivityLog,
};
