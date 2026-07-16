import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { IngestionRunService } from './ingestionRun.service';

const DEFAULT_LIMIT = 20;

const listRuns = catchAsync(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : DEFAULT_LIMIT;
  const runs = await IngestionRunService.listRuns(Number.isFinite(limit) ? limit : DEFAULT_LIMIT);
  const sourceHealth = IngestionRunService.computeZeroStreaks(runs);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Ingestion run history retrieved successfully',
    data: { runs, sourceHealth },
  });
});

export const IngestionRunController = {
  listRuns,
};
