import AppError from '../../errors/AppError';
import { decrypt, encrypt } from '../../lib/crypto';
import { httpStatus } from '../../utils/httpStatus';
import { ILlmModel, ILlmProvider, LlmModelCapability, LlmProviderType, LlmTask } from './llmProvider.interface';
import { LlmModel, LlmProvider, LlmTaskDefault } from './llmProvider.model';

const createProvider = async (payload: Pick<ILlmProvider, 'provider_type' | 'name'> & { is_active?: boolean }) => {
  return LlmProvider.create(payload);
};

const listProviders = async () => {
  // `encrypted_key` is `select: false` on the key subdocument schema — this naturally returns
  // only masked key metadata (key_last4, label, is_active, created_at) without extra effort here.
  return LlmProvider.find().sort('-created_at');
};

const getProvider = async (id: string) => {
  const provider = await LlmProvider.findById(id);
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }
  return provider;
};

const updateProvider = async (id: string, payload: Partial<Pick<ILlmProvider, 'name' | 'is_active'>>) => {
  const provider = await LlmProvider.findByIdAndUpdate(
    id,
    { ...payload, updated_at: new Date() },
    { new: true, runValidators: true },
  );
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }
  return provider;
};

const deleteProvider = async (id: string) => {
  const provider = await LlmProvider.findByIdAndDelete(id);
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }
  // Cascading delete, not a Mongo-level hook — matches this codebase's existing convention of
  // explicit two-step deletes over transactions (see design.md decision 5).
  await LlmModel.deleteMany({ provider_id: provider._id });
  return provider;
};

const addKey = async (providerId: string, key: string, label?: string) => {
  const provider = await LlmProvider.findById(providerId);
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }

  provider.keys.push({
    encrypted_key: encrypt(key),
    key_last4: key.slice(-4),
    label,
    is_active: true,
    created_at: new Date(),
  } as ILlmProvider['keys'][number]);
  provider.updated_at = new Date();
  await provider.save();

  // `select: false` on `encrypted_key` only excludes it from *query* results — a subdocument
  // just pushed in memory (like the one above) never went through a query and still carries its
  // plaintext-adjacent ciphertext. Re-fetching through a fresh, masked query before returning is
  // what actually keeps it out of the response — returning `provider` directly here would leak it.
  return LlmProvider.findById(providerId);
};

const updateKey = async (providerId: string, keyId: string, payload: { label?: string; is_active?: boolean }) => {
  const provider = await LlmProvider.findById(providerId);
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }
  const key = provider.keys.id(keyId);
  if (!key) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider key not found');
  }
  if (payload.label !== undefined) key.label = payload.label;
  if (payload.is_active !== undefined) key.is_active = payload.is_active;
  provider.updated_at = new Date();
  await provider.save();
  return provider;
};

const deleteKey = async (providerId: string, keyId: string) => {
  const provider = await LlmProvider.findById(providerId);
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }
  const key = provider.keys.id(keyId);
  if (!key) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider key not found');
  }
  key.deleteOne();
  provider.updated_at = new Date();
  await provider.save();
  return provider;
};

const revealKey = async (providerId: string, keyId: string) => {
  const provider = await LlmProvider.findById(providerId).select('+keys.encrypted_key');
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }
  const key = provider.keys.id(keyId);
  if (!key) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider key not found');
  }
  return { key_id: key._id, key: decrypt(key.encrypted_key) };
};

const createModel = async (providerId: string, payload: { model_id: string; display_name: string; capabilities: LlmModelCapability[]; is_active?: boolean }) => {
  const provider = await LlmProvider.findById(providerId);
  if (!provider) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM provider not found');
  }
  return LlmModel.create({ ...payload, provider_id: provider._id });
};

const listModels = async (providerId: string) => {
  return LlmModel.find({ provider_id: providerId }).sort('-created_at');
};

const updateModel = async (
  providerId: string,
  modelId: string,
  payload: Partial<Pick<ILlmModel, 'display_name' | 'capabilities' | 'is_active'>>,
) => {
  const model = await LlmModel.findOneAndUpdate({ _id: modelId, provider_id: providerId }, payload, {
    new: true,
    runValidators: true,
  });
  if (!model) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM model not found');
  }
  return model;
};

const deleteModel = async (providerId: string, modelId: string) => {
  const model = await LlmModel.findOneAndDelete({ _id: modelId, provider_id: providerId });
  if (!model) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM model not found');
  }
  return model;
};

const setTaskDefault = async (task: LlmTask, llmModelId: string) => {
  const modelDoc = await LlmModel.findById(llmModelId);
  if (!modelDoc) {
    throw new AppError(httpStatus.NOT_FOUND, 'LLM model not found');
  }
  return LlmTaskDefault.findOneAndUpdate(
    { task },
    { task, llm_model_id: modelDoc._id, updated_at: new Date() },
    { new: true, upsert: true, runValidators: true },
  ).populate('llm_model_id');
};

const listTaskDefaults = async () => {
  return LlmTaskDefault.find().sort('task').populate('llm_model_id');
};

/** Unsets a task's global default entirely — resolution for that task falls through straight to
 *  the team tier (if any) then bootstrap, same soft-fail path as a dangling/deleted-model reference. */
const clearTaskDefault = async (task: LlmTask) => {
  const deleted = await LlmTaskDefault.findOneAndDelete({ task });
  if (!deleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'No global default is set for that task');
  }
  return deleted;
};

/** Active, chat-capable models across all active providers — the flat shape the frontend picker needs. */
const listActiveModels = async () => {
  const activeProviders = await LlmProvider.find({ is_active: true }).select('_id provider_type name');
  const providerIds = activeProviders.map((p) => p._id);
  const models = await LlmModel.find({
    provider_id: { $in: providerIds },
    is_active: true,
    capabilities: 'chat',
  }).sort('display_name');

  const providerById = new Map(activeProviders.map((p) => [p._id.toString(), p]));
  return models.map((m) => {
    const provider = providerById.get(m.provider_id.toString());
    return {
      _id: m._id,
      model_id: m.model_id,
      display_name: m.display_name,
      provider_id: m.provider_id,
      provider_type: provider?.provider_type,
      provider_name: provider?.name,
    };
  });
};

export const LlmProviderService = {
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

export type { LlmProviderType };
