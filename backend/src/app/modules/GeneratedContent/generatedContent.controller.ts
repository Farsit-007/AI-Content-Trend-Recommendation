import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { IRequestUser } from '../User/user.interface';
import { GeneratedContentStatus } from './generatedContent.interface';
import { GeneratedContentService } from './generatedContent.service';

const list = catchAsync(async (req: Request, res: Response) => {
  const result = await GeneratedContentService.listDrafts(
    req.query as { team_id: string; status?: string; source?: string; page?: string; limit?: string },
    req.user as IRequestUser,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Generated content retrieved successfully',
    data: result.result,
    meta: result.meta,
  });
});

const triggerRun = catchAsync(async (req: Request, res: Response) => {
  const teamId = (req.body as { team_id?: string })?.team_id;
  const summary = await GeneratedContentService.triggerRun(teamId, req.user as IRequestUser);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Auto-generation run complete',
    data: summary,
  });
});

const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body as { status: GeneratedContentStatus };
  const result = await GeneratedContentService.updateStatus(id, status, req.user as IRequestUser);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Status updated successfully',
    data: result,
  });
});

export const GeneratedContentController = {
  list,
  triggerRun,
  updateStatus,
};
