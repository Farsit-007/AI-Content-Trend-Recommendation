import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { PlatformCatalogService } from './platformCatalog.service';

const createPlatform = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.createPlatform(req.body, req.user!.id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Platform added to the catalog successfully',
    data: result,
  });
});

const listPlatforms = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.listPlatforms(req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platforms retrieved successfully',
    data: result,
  });
});

const enablePlatform = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.setPlatformEnabled(req.params.name as string, true);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform enabled successfully',
    data: result,
  });
});

const disablePlatform = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.setPlatformEnabled(req.params.name as string, false);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform disabled successfully',
    data: result,
  });
});

const deletePlatform = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.deletePlatform(req.params.name as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform removed from the catalog successfully',
    data: result,
  });
});

const listTeamPlatforms = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.listTeamPlatforms(req.params.teamId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Team's platforms retrieved successfully",
    data: result,
  });
});

const enableForTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.enableForTeam(
    req.params.teamId as string,
    req.params.platform as string,
    req.user!.id,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform enabled for team successfully',
    data: result,
  });
});

const disableForTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformCatalogService.disableForTeam(
    req.params.teamId as string,
    req.params.platform as string,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform disabled for team successfully',
    data: result,
  });
});

export const PlatformCatalogController = {
  createPlatform,
  listPlatforms,
  enablePlatform,
  disablePlatform,
  deletePlatform,
  listTeamPlatforms,
  enableForTeam,
  disableForTeam,
};
