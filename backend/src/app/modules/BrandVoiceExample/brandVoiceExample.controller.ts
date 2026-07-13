import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { BrandVoiceExampleService } from './brandVoiceExample.service';

const createBrandVoiceExample = catchAsync(async (req: Request, res: Response) => {
  const result = await BrandVoiceExampleService.createBrandVoiceExample(req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Brand voice example created successfully',
    data: result,
  });
});

const getAllBrandVoiceExamples = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await BrandVoiceExampleService.getAllBrandVoiceExamples(req.query, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Brand voice examples retrieved successfully',
    meta,
    data: result,
  });
});

const getSingleBrandVoiceExample = catchAsync(async (req: Request, res: Response) => {
  const result = await BrandVoiceExampleService.getSingleBrandVoiceExample(req.params.id as string, req.user!);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Brand voice example not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Brand voice example retrieved successfully',
    data: result,
  });
});

const updateBrandVoiceExample = catchAsync(async (req: Request, res: Response) => {
  const result = await BrandVoiceExampleService.updateBrandVoiceExample(
    req.params.id as string,
    req.body,
    req.user!,
  );
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Brand voice example not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Brand voice example updated successfully',
    data: result,
  });
});

const deleteBrandVoiceExample = catchAsync(async (req: Request, res: Response) => {
  const result = await BrandVoiceExampleService.deleteBrandVoiceExample(req.params.id as string, req.user!);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Brand voice example not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Brand voice example deleted successfully',
    data: result,
  });
});

export const BrandVoiceExampleController = {
  createBrandVoiceExample,
  getAllBrandVoiceExamples,
  getSingleBrandVoiceExample,
  updateBrandVoiceExample,
  deleteBrandVoiceExample,
};
