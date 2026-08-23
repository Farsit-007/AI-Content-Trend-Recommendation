import { z } from 'zod';
import { LLM_TASKS } from './llmProvider.interface';

const providerType = z.enum(['openrouter', 'anthropic', 'openai']);
const capability = z.enum(['chat', 'embedding']);
const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const createProviderValidation = z.object({
  body: z.object({
    provider_type: providerType,
    name: z.string({ required_error: 'name is required' }).min(1),
    is_active: z.boolean().optional(),
  }),
});

const updateProviderValidation = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    is_active: z.boolean().optional(),
  }),
});

const addKeyValidation = z.object({
  body: z.object({
    key: z.string({ required_error: 'key is required' }).min(1),
    label: z.string().optional(),
  }),
});

const updateKeyValidation = z.object({
  body: z.object({
    label: z.string().optional(),
    is_active: z.boolean().optional(),
  }),
});

/** USD per 1M tokens. Optional — an unpriced model still meters tokens, it just reports no cost. */
const costPer1m = z
  .number()
  .nonnegative('cost per 1M tokens cannot be negative')
  .optional();

const createModelValidation = z.object({
  body: z.object({
    model_id: z.string({ required_error: 'model_id is required' }).min(1),
    display_name: z
      .string({ required_error: 'display_name is required' })
      .min(1),
    capabilities: z
      .array(capability)
      .min(1, 'at least one capability is required'),
    is_active: z.boolean().optional(),
    input_cost_per_1m_usd: costPer1m,
    output_cost_per_1m_usd: costPer1m,
  }),
});

const updateModelValidation = z.object({
  body: z.object({
    display_name: z.string().min(1).optional(),
    capabilities: z.array(capability).min(1).optional(),
    is_active: z.boolean().optional(),
    input_cost_per_1m_usd: costPer1m,
    output_cost_per_1m_usd: costPer1m,
  }),
});

const setTaskDefaultValidation = z.object({
  params: z.object({
    task: z.enum(LLM_TASKS),
  }),
  body: z.object({
    llm_model_id: objectId,
  }),
});

const clearTaskDefaultValidation = z.object({
  params: z.object({
    task: z.enum(LLM_TASKS),
  }),
});

export const LlmProviderValidation = {
  createProviderValidation,
  updateProviderValidation,
  addKeyValidation,
  updateKeyValidation,
  createModelValidation,
  updateModelValidation,
  setTaskDefaultValidation,
  clearTaskDefaultValidation,
};
