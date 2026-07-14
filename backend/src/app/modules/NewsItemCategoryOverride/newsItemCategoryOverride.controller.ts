import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { NewsItemCategoryOverrideService } from './newsItemCategoryOverride.service';

const setOverride = catchAsync(async (req: Request, res: Response) => {
  const { team_id, category, opportunity_score } = req.body;
  const result = await NewsItemCategoryOverrideService.setOverride(
    req.params.id as string,
    team_id,
    { category, opportunity_score },
    req.user!,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'News item override saved successfully',
    data: result,
  });
});

const clearOverride = catchAsync(async (req: Request, res: Response) => {
  const result = await NewsItemCategoryOverrideService.clearOverride(
    req.params.id as string,
    req.body.team_id,
    req.user!,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'News item override cleared successfully',
    data: result,
  });
});

export const NewsItemCategoryOverrideController = {
  setOverride,
  clearOverride,
};
