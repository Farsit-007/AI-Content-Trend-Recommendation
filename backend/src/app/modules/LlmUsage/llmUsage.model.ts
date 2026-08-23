import { Schema, model } from 'mongoose';
import { LLM_TASKS } from '../LlmProvider/llmProvider.interface';
import { ILlmUsageDaily, ILlmUsageEvent } from './llmUsage.interface';

/**
 * How long raw event rows are kept. The daily rollup is permanent; the events behind it are not,
 * because one row per provider call is the highest-volume write in the system and its value decays
 * fast — it exists to explain a specific request, which nobody investigates a quarter later.
 */
const EVENT_TTL_DAYS = 90;

const llmUsageEventSchema = new Schema<ILlmUsageEvent>({
  team_id: { type: String, default: null },
  task: { type: String, enum: LLM_TASKS, required: true },
  operation: {
    type: String,
    enum: ['chat', 'stream', 'embed', 'embed_batch'],
    required: true,
  },
  tier: {
    type: String,
    enum: ['request', 'team', 'global', 'bootstrap'],
    required: true,
  },
  provider_type: {
    type: String,
    enum: ['openrouter', 'anthropic', 'openai'],
    required: true,
  },
  model: { type: String, required: true },
  key_id: { type: String },
  prompt_tokens: { type: Number },
  completion_tokens: { type: Number },
  cached_prompt_tokens: { type: Number },
  estimated_cost_usd: { type: Number },
  duration_ms: { type: Number, required: true },
  usage_reported: { type: Boolean, required: true },
  created_at: { type: Date, default: Date.now },
});

// Serves "what did this team spend recently" and "what happened around 14:05" alike.
llmUsageEventSchema.index({ team_id: 1, created_at: -1 });
llmUsageEventSchema.index(
  { created_at: 1 },
  { expireAfterSeconds: EVENT_TTL_DAYS * 24 * 3600 },
);

export const LlmUsageEvent = model<ILlmUsageEvent>(
  'LlmUsageEvent',
  llmUsageEventSchema,
  'llm_usage',
);

const llmUsageDailySchema = new Schema<ILlmUsageDaily>({
  team_id: { type: String, default: null },
  date: { type: String, required: true },
  task: { type: String, enum: LLM_TASKS, required: true },
  model: { type: String, required: true },
  calls: { type: Number, default: 0 },
  calls_without_usage: { type: Number, default: 0 },
  prompt_tokens: { type: Number, default: 0 },
  completion_tokens: { type: Number, default: 0 },
  cached_prompt_tokens: { type: Number, default: 0 },
  estimated_cost_usd: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },
});

// The upsert key. Unique so two concurrent calls in the same bucket race into one `$inc` rather
// than creating two rows that a later sum would have to reconcile.
llmUsageDailySchema.index(
  { team_id: 1, date: 1, task: 1, model: 1 },
  { unique: true },
);
llmUsageDailySchema.index({ date: -1 });

export const LlmUsageDaily = model<ILlmUsageDaily>(
  'LlmUsageDaily',
  llmUsageDailySchema,
  'llm_usage_daily',
);
