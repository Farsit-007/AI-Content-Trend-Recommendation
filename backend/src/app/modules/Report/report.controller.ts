import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { getReport } from './report.service';

const getReportHandler = catchAsync(async (req: Request, res: Response) => {
  const teamId = req.query.team_id as string;
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
  const forceRefresh = isAdmin && req.query.refresh === 'true';

  const result = await getReport(teamId, req.user!, forceRefresh);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report generated successfully',
    data: result,
  });
});

export const ReportController = {
  getReportHandler,
};
