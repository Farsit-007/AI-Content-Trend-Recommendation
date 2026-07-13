import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { PlatformPostService } from './platformPost.service';

const createPlatformPost = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformPostService.createPlatformPost(req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Platform post created successfully',
    data: result,
  });
});

const getAllPlatformPosts = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await PlatformPostService.getAllPlatformPosts(req.query, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform posts retrieved successfully',
    meta,
    data: result,
  });
});

const getSinglePlatformPost = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformPostService.getSinglePlatformPost(req.params.id as string, req.user!);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Platform post not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform post retrieved successfully',
    data: result,
  });
});

const updatePlatformPost = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformPostService.updatePlatformPost(req.params.id as string, req.body, req.user!);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Platform post not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform post updated successfully',
    data: result,
  });
});

const deletePlatformPost = catchAsync(async (req: Request, res: Response) => {
  const result = await PlatformPostService.deletePlatformPost(req.params.id as string, req.user!);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Platform post not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform post deleted successfully',
    data: result,
  });
});

export const PlatformPostController = {
  createPlatformPost,
  getAllPlatformPosts,
  getSinglePlatformPost,
  updatePlatformPost,
  deletePlatformPost,
};
