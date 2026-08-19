import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { IngestionAlreadyRunningError, runIngestionPipeline } from './newsIngestion.service';

const ingestNews = catchAsync(async (_req: Request, res: Response) => {
  let result;
  try {
    result = await runIngestionPipeline('manual');
  } catch (err) {
    // Translate lock contention into a 409 so the admin UI can say "already running" instead of
    // surfacing it as an unexplained 500.
    if (err instanceof IngestionAlreadyRunningError) {
      throw new AppError(httpStatus.CONFLICT, err.message);
    }
    throw err;
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'News ingestion run complete',
    data: result,
  });
});

export const NewsIngestionController = {
  ingestNews,
};
