import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { MaintenanceRunService } from './maintenanceRun.service';

const DEFAULT_LIMIT = 20;
const VALID_JOBS = ['engagement_refresh', 'retention'] as const;

const listRuns = catchAsync(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : DEFAULT_LIMIT;
  const jobParam = req.query.job as string | undefined;
  const job = VALID_JOBS.includes(jobParam as (typeof VALID_JOBS)[number])
    ? (jobParam as (typeof VALID_JOBS)[number])
    : undefined;

  const runs = await MaintenanceRunService.listRuns(Number.isFinite(limit) ? limit : DEFAULT_LIMIT, job);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Maintenance run history retrieved successfully',
    data: { runs },
  });
});

export const MaintenanceRunController = {
  listRuns,
};
