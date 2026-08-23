import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export type LlmProviderType = 'openrouter' | 'anthropic' | 'openai';
export type LlmModelCapability = 'chat' | 'embedding';
export type LlmTask =
  | 'content_generation'
  | 'chat'
  | 'categorization'
  | 'dedup_adjudication'
  | 'style_card'
  | 'critique'
  | 'fact_extraction'
  | 'embedding';

export const LLM_TASKS: LlmTask[] = [
  'content_generation',
  'chat',
  'categorization',
  'dedup_adjudication',
  'style_card',
  'critique',
  'fact_extraction',
  'embedding',
];

export interface LlmProviderKeyDto {
  _id: string;
  /** Never the real key — masked to the last 4 characters. Use revealProviderKey for the real value. */
  key_last4: string;
  label?: string;
  is_active: boolean;
  created_at: string;
  /**
   * Live key health, from the backend's Redis cooldown store. A key that just rate-limited is held
   * out of rotation for this long; `null` means it is serving traffic normally.
   */
  cooldown_remaining_ms?: number | null;
  cooldown_reason?: 'rate_limited' | 'exhausted' | 'bad_key' | 'transient' | 'permanent' | null;
  /** Failures attributed to this key in the last 24h. */
  recent_failure_count?: number;
}

export interface LlmProviderDto {
  _id: string;
  provider_type: LlmProviderType;
  name: string;
  keys: LlmProviderKeyDto[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LlmModelDto {
  _id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  capabilities: LlmModelCapability[];
  is_active: boolean;
  created_at: string;
}

/** Flat, active/chat-capable-only projection any authenticated user can read — the Generate page picker's source. */
export interface LlmModelActiveDto {
  _id: string;
  model_id: string;
  display_name: string;
  provider_id: string;
  provider_type: LlmProviderType;
  provider_name: string;
}

export interface LlmTaskDefaultDto {
  _id: string;
  task: LlmTask;
  /** Populated with the full LlmModel on read. `null` when the referenced LlmModel was since
   *  deleted — a dangling reference the resolver soft-fails through, but the admin UI must not crash on. */
  llm_model_id: LlmModelDto | string | null;
  updated_at: string;
}

// --- Providers (super_admin only) --------------------------------------------

export function listLlmProviders(): Promise<LlmProviderDto[]> {
  return apiGet<LlmProviderDto[]>('/llm-providers');
}

export function createLlmProvider(payload: { provider_type: LlmProviderType; name: string }): Promise<LlmProviderDto> {
  return apiPost<LlmProviderDto>('/llm-providers', payload);
}

export function updateLlmProvider(id: string, payload: { name?: string; is_active?: boolean }): Promise<LlmProviderDto> {
  return apiPatch<LlmProviderDto>(`/llm-providers/${id}`, payload);
}

export function deleteLlmProvider(id: string): Promise<LlmProviderDto> {
  return apiDelete<LlmProviderDto>(`/llm-providers/${id}`);
}

// --- Keys (super_admin only) --------------------------------------------------

export function addLlmProviderKey(providerId: string, payload: { key: string; label?: string }): Promise<LlmProviderDto> {
  return apiPost<LlmProviderDto>(`/llm-providers/${providerId}/keys`, payload);
}

export function updateLlmProviderKey(
  providerId: string,
  keyId: string,
  payload: { label?: string; is_active?: boolean },
): Promise<LlmProviderDto> {
  return apiPatch<LlmProviderDto>(`/llm-providers/${providerId}/keys/${keyId}`, payload);
}

export function deleteLlmProviderKey(providerId: string, keyId: string): Promise<LlmProviderDto> {
  return apiDelete<LlmProviderDto>(`/llm-providers/${providerId}/keys/${keyId}`);
}

/** POST .../reveal — the only endpoint that ever returns the real plaintext key. Use sparingly. */
export function revealLlmProviderKey(providerId: string, keyId: string): Promise<{ key_id: string; key: string }> {
  return apiPost<{ key_id: string; key: string }>(`/llm-providers/${providerId}/keys/${keyId}/reveal`);
}

// --- Models (super_admin only) ------------------------------------------------

export function listLlmModels(providerId: string): Promise<LlmModelDto[]> {
  return apiGet<LlmModelDto[]>(`/llm-providers/${providerId}/models`);
}

export function createLlmModel(
  providerId: string,
  payload: { model_id: string; display_name: string; capabilities: LlmModelCapability[] },
): Promise<LlmModelDto> {
  return apiPost<LlmModelDto>(`/llm-providers/${providerId}/models`, payload);
}

export function updateLlmModel(
  providerId: string,
  modelId: string,
  payload: { display_name?: string; capabilities?: LlmModelCapability[]; is_active?: boolean },
): Promise<LlmModelDto> {
  return apiPatch<LlmModelDto>(`/llm-providers/${providerId}/models/${modelId}`, payload);
}

export function deleteLlmModel(providerId: string, modelId: string): Promise<LlmModelDto> {
  return apiDelete<LlmModelDto>(`/llm-providers/${providerId}/models/${modelId}`);
}

// --- Task defaults (super_admin only) -----------------------------------------

export function listLlmTaskDefaults(): Promise<LlmTaskDefaultDto[]> {
  return apiGet<LlmTaskDefaultDto[]>('/llm-providers/task-defaults');
}

export function setLlmTaskDefault(task: LlmTask, llmModelId: string): Promise<LlmTaskDefaultDto> {
  return apiPut<LlmTaskDefaultDto>(`/llm-providers/task-defaults/${task}`, { llm_model_id: llmModelId });
}

/** Unsets a task's global default — resolution for it falls through to the team tier then bootstrap. */
export function clearLlmTaskDefault(task: LlmTask): Promise<LlmTaskDefaultDto> {
  return apiDelete<LlmTaskDefaultDto>(`/llm-providers/task-defaults/${task}`);
}

// --- Active models (any authenticated user — the Generate page picker) -------

export function listActiveLlmModels(capability?: LlmModelCapability): Promise<LlmModelActiveDto[]> {
  return apiGet<LlmModelActiveDto[]>('/llm-providers/models/active', { params: capability ? { capability } : undefined });
}
