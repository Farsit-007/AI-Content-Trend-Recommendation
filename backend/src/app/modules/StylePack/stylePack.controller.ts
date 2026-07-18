import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { StylePackService } from './stylePack.service';

const createPack = catchAsync(async (req: Request, res: Response) => {
  const result = await StylePackService.createPack({ ...req.body, created_by: req.user!.id });
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Style pack created successfully',
    data: result,
  });
});

const listPacks = catchAsync(async (req: Request, res: Response) => {
  const includeInactive = req.query.include_inactive === 'true';
  const result = await StylePackService.listPacks(includeInactive, req.user!.role);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Style packs retrieved successfully',
    data: result,
  });
});

const getPackById = catchAsync(async (req: Request, res: Response) => {
  const result = await StylePackService.getPackById(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Style pack retrieved successfully',
    data: result,
  });
});

const updatePack = catchAsync(async (req: Request, res: Response) => {
  const result = await StylePackService.updatePack(req.params.id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Style pack updated successfully',
    data: result,
  });
});

const deletePack = catchAsync(async (req: Request, res: Response) => {
  const result = await StylePackService.deletePack(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Style pack deleted successfully',
    data: result,
  });
});

const addExample = catchAsync(async (req: Request, res: Response) => {
  const result = await StylePackService.addExample(req.params.id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Style example added successfully',
    data: result,
  });
});

const listExamples = catchAsync(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const { meta, result } = await StylePackService.listExamples(req.params.id as string, page, limit);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Style examples retrieved successfully',
    meta,
    data: result,
  });
});

const deleteExample = catchAsync(async (req: Request, res: Response) => {
  const result = await StylePackService.deleteExample(req.params.id as string, req.params.exampleId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Style example deleted successfully',
    data: result,
  });
});

export const StylePackController = {
  createPack,
  listPacks,
  getPackById,
  updatePack,
  deletePack,
  addExample,
  listExamples,
  deleteExample,
};
