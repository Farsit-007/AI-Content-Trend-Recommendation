import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { NewsItemService } from './newsItem.service';

const createNewsItem = catchAsync(async (req: Request, res: Response) => {
  const result = await NewsItemService.createNewsItem(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'News item created successfully',
    data: result,
  });
});

const getAllNewsItems = catchAsync(async (req: Request, res: Response) => {
  const { meta, result } = await NewsItemService.getAllNewsItems(req.query, req.user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'News items retrieved successfully',
    meta,
    data: result,
  });
});

const getSingleNewsItem = catchAsync(async (req: Request, res: Response) => {
  const result = await NewsItemService.getSingleNewsItem(req.params.id as string, req.user);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'News item not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'News item retrieved successfully',
    data: result,
  });
});

const updateNewsItem = catchAsync(async (req: Request, res: Response) => {
  const result = await NewsItemService.updateNewsItem(req.params.id as string, req.body);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'News item not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'News item updated successfully',
    data: result,
  });
});

const deleteNewsItem = catchAsync(async (req: Request, res: Response) => {
  const result = await NewsItemService.deleteNewsItem(req.params.id as string);
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'News item not found');
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'News item deleted successfully',
    data: result,
  });
});

export const NewsItemController = {
  createNewsItem,
  getAllNewsItems,
  getSingleNewsItem,
  updateNewsItem,
  deleteNewsItem,
};
