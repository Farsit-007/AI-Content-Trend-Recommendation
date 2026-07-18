import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { IRequestUser } from '../User/user.interface';
import { StatsService } from './stats.service';

const getOverview = catchAsync(async (req: Request, res: Response) => {
  const teamId = req.query.team_id as string | undefined;
  const result = await StatsService.getOverview(teamId, req.user as IRequestUser);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Overview stats retrieved successfully',
    data: result,
  });
});

export const StatsController = {
  getOverview,
};
