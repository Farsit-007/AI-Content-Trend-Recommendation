import { Types } from 'mongoose';

export type LlmProviderType = 'openrouter' | 'anthropic' | 'openai';
export type LlmModelCapability = 'chat' | 'embedding';

export interface ILlmProviderKey {
  _id: Types.ObjectId;
  /** AES-256-GCM ciphertext (see lib/crypto.ts) — never returned in list/read responses. */
  encrypted_key: string;
  /** Last 4 characters of the plaintext key, so list views can show `••••1234` without decrypting. */
  key_last4: string;
  label?: string;
  is_active: boolean;
  created_at: Date;
}

export interface ILlmProvider {
  provider_type: LlmProviderType;
  name: string;
  /** A Mongoose `Types.DocumentArray` (not a plain array) — subdocuments support `.id()`/`.deleteOne()`. */
  keys: Types.DocumentArray<ILlmProviderKey>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ILlmModel {
  provider_id: Types.ObjectId;
  model_id: string;
  display_name: string;
  capabilities: LlmModelCapability[];
  is_active: boolean;
  created_at: Date;
}

/** The named tasks `resolveModelForTask` resolves a model for. Kept here (not modelResolution.ts) so the
 *  LlmProvider module — model, validation, and the resolver — share one definition with no import cycle. */
export const LLM_TASKS = [
  'content_generation',
  'chat',
  'categorization',
  'dedup_adjudication',
  'style_card',
  'critique',
  'fact_extraction',
  'embedding',
] as const;
export type LlmTask = (typeof LLM_TASKS)[number];

/** One row per task — a super-admin-set global default `LlmModel` to use when no team/request override applies. */
export interface ILlmTaskDefault {
  task: LlmTask;
  llm_model_id: Types.ObjectId;
  updated_at: Date;
}
