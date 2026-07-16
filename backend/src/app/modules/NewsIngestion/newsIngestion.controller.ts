import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { runIngestionPipeline } from './newsIngestion.service';

const ingestNews = catchAsync(async (_req: Request, res: Response) => {
  const result = await runIngestionPipeline('manual');
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
