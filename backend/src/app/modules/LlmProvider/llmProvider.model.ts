import { Schema, model } from 'mongoose';
import {
  ILlmModel,
  ILlmProvider,
  ILlmProviderKey,
  ILlmTaskDefault,
  LLM_TASKS,
} from './llmProvider.interface';

const llmProviderKeySchema = new Schema<ILlmProviderKey>({
  encrypted_key: { type: String, required: true, select: false },
  key_last4: { type: String, required: true },
  label: { type: String, trim: true },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
});

const llmProviderSchema = new Schema<ILlmProvider>({
  provider_type: {
    type: String,
    enum: ['openrouter', 'anthropic', 'openai'],
    required: true,
  },
  name: { type: String, required: true, trim: true },
  keys: { type: [llmProviderKeySchema], default: [] },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

export const LlmProvider = model<ILlmProvider>(
  'LlmProvider',
  llmProviderSchema,
  'llm_providers',
);

const llmModelSchema = new Schema<ILlmModel>({
  provider_id: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'LlmProvider',
  },
  model_id: { type: String, required: true, trim: true },
  display_name: { type: String, required: true, trim: true },
  capabilities: { type: [String], enum: ['chat', 'embedding'], default: [] },
  is_active: { type: Boolean, default: true },
  // Optional pricing, in USD per 1M tokens — feeds `estimated_cost_usd` in the usage ledger.
  // Unset means the ledger records tokens but no cost for this model, which is the correct
  // behaviour: guessing a price would put an invented number on a spend dashboard.
  input_cost_per_1m_usd: { type: Number, min: 0 },
  output_cost_per_1m_usd: { type: Number, min: 0 },
  created_at: { type: Date, default: Date.now },
});

llmModelSchema.index({ provider_id: 1 });

export const LlmModel = model<ILlmModel>(
  'LlmModel',
  llmModelSchema,
  'llm_models',
);

const llmTaskDefaultSchema = new Schema<ILlmTaskDefault>({
  task: { type: String, enum: LLM_TASKS, required: true, unique: true },
  llm_model_id: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'LlmModel',
  },
  updated_at: { type: Date, default: Date.now },
});

export const LlmTaskDefault = model<ILlmTaskDefault>(
  'LlmTaskDefault',
  llmTaskDefaultSchema,
  'llm_task_defaults',
);
