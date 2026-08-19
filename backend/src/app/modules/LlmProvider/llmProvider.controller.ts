import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { PLATFORM_SCOPE } from '../ActivityLog/activityLog.interface';
import { ActivityLogService } from '../ActivityLog/activityLog.service';
import { IRequestUser } from '../User/user.interface';
import { LlmProviderService } from './llmProvider.service';

const createProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.createProvider(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'LLM provider created successfully',
    data: result,
  });
});

const listProviders = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.listProviders();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM providers retrieved successfully',
    data: result,
  });
});

const getProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.getProvider(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM provider retrieved successfully',
    data: result,
  });
});

const updateProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.updateProvider(req.params.id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM provider updated successfully',
    data: result,
  });
});

const deleteProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.deleteProvider(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM provider deleted successfully',
    data: result,
  });
});

const addKey = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.addKey(req.params.id as string, req.body.key, req.body.label);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'LLM provider key added successfully',
    data: result,
  });
});

const updateKey = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.updateKey(req.params.id as string, req.params.keyId as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM provider key updated successfully',
    data: result,
  });
});

const deleteKey = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.deleteKey(req.params.id as string, req.params.keyId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM provider key deleted successfully',
    data: result,
  });
});

/**
 * Decrypting a stored provider key to plaintext is the most sensitive operation in the product, and
 * until now it was the only privileged action that left no trace — every lesser one (draft
 * dismissals, membership changes, category corrections) is already recorded. Audited here in the
 * controller rather than the service so the actor is in scope.
 */
const revealKey = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.revealKey(req.params.id as string, req.params.keyId as string);

  // After the reveal succeeded, and fire-and-forget — an audit-write failure must not fail the
  // request the admin actually made. Never logs the key itself, only that it was revealed.
  await ActivityLogService.recordActivity({
    team_id: PLATFORM_SCOPE,
    actor: req.user as IRequestUser,
    action: 'llm.key_revealed',
    summary: `Revealed API key ${result.key_id} on LLM provider ${req.params.id}`,
    target_type: 'llm_provider_key',
    target_id: String(result.key_id),
    metadata: { provider_id: req.params.id },
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM provider key revealed successfully',
    data: result,
  });
});

const createModel = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.createModel(req.params.id as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'LLM model created successfully',
    data: result,
  });
});

const listModels = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.listModels(req.params.id as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM models retrieved successfully',
    data: result,
  });
});

const updateModel = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.updateModel(req.params.id as string, req.params.modelId as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM model updated successfully',
    data: result,
  });
});

const deleteModel = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.deleteModel(req.params.id as string, req.params.modelId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM model deleted successfully',
    data: result,
  });
});

const setTaskDefault = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.setTaskDefault(
    req.params.task as Parameters<typeof LlmProviderService.setTaskDefault>[0],
    req.body.llm_model_id,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM task default set successfully',
    data: result,
  });
});

const listTaskDefaults = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.listTaskDefaults();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM task defaults retrieved successfully',
    data: result,
  });
});

const clearTaskDefault = catchAsync(async (req: Request, res: Response) => {
  const result = await LlmProviderService.clearTaskDefault(
    req.params.task as Parameters<typeof LlmProviderService.clearTaskDefault>[0],
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LLM task default cleared successfully',
    data: result,
  });
});

const listActiveModels = catchAsync(async (req: Request, res: Response) => {
  const capability = req.query.capability === 'embedding' ? 'embedding' : 'chat';
  const result = await LlmProviderService.listActiveModels(capability);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Active LLM models retrieved successfully',
    data: result,
  });
});

export const LlmProviderController = {
  createProvider,
  listProviders,
  getProvider,
  updateProvider,
  deleteProvider,
  addKey,
  updateKey,
  deleteKey,
  revealKey,
  createModel,
  listModels,
  updateModel,
  deleteModel,
  setTaskDefault,
  listTaskDefaults,
  clearTaskDefault,
  listActiveModels,
};
