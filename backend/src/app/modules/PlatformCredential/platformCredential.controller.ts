import { Request, Response } from 'express';
import { Platform } from '../../lib/platforms';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { PlatformCredentialService } from './platformCredential.service';

const upsertCredential = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCredentialService.upsertCredential(
    req.params.teamId as string,
    req.body,
    req.user!.id,
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Platform credential saved successfully',
    data: result,
  });
});

const listCredentials = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCredentialService.listCredentials(req.params.teamId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform credentials retrieved successfully',
    data: result,
  });
});

const revealCredential = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCredentialService.revealCredential(
    req.params.teamId as string,
    req.params.platform as Platform,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform credential revealed successfully',
    data: result,
  });
});

const deleteCredential = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCredentialService.deleteCredential(
    req.params.teamId as string,
    req.params.platform as Platform,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform credential deleted successfully',
    data: result,
  });
});

export const PlatformCredentialController = {
  upsertCredential,
  listCredentials,
  revealCredential,
  deleteCredential,
};
