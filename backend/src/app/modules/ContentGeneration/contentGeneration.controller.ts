import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { ContentGenerationService } from './contentGeneration.service';

const generateContent = catchAsync(async (req: Request, res: Response) => {
  const result = await ContentGenerationService.generateContent(req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Content generated successfully',
    data: result,
  });
});

export const ContentGenerationController = {
  generateContent,
};
