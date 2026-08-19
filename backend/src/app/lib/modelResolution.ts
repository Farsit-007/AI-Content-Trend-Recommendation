import { Types } from 'mongoose';
import config from '../config';
import { decrypt } from './crypto';
import { logger } from './logger';
import { chatCompletion, ChatMessage, LLM_MODELS } from './llmClient';
import { embed, embedBatch } from './embeddings';
import { AdapterChatMessage, getAdapter } from '../modules/LlmProvider/llmProvider.adapters';
import { LlmModelCapability, LlmProviderType, LlmTask } from '../modules/LlmProvider/llmProvider.interface';
import { LlmModel, LlmProvider, LlmTaskDefault } from '../modules/LlmProvider/llmProvider.model';
import { Team } from '../modules/Team/team.model';

export type { LlmTask } from '../modules/LlmProvider/llmProvider.interface';
export { LLM_TASKS } from '../modules/LlmProvider/llmProvider.interface';

export interface ResolveContext {
  teamId?: string;
  /** An `LlmModel._id`, from the request's `llm_model_id`. */
  requestModelId?: string;
  /** Excludes a specific key from tier resolution — used by the failover retry to skip the key that just failed. */
  excludeKeyId?: string;
}

export interface ResolvedModel {
  source: 'request' | 'team' | 'global' | 'bootstrap';
  provider_type: LlmProviderType;
  /** The literal string passed to the provider API. */
  model_id: string;
  /** Decrypted, ready to hand to `getAdapter`. Meaningless (equal to the static `.env` key) at the bootstrap tier. */
  api_key: string;
  /** Undefined only for the bootstrap tier — there is no `LlmProviderKey` document to reference. */
  key_id?: string;
}

/**
 * Thrown when every DB tier (request/team/global) falls through AND no bootstrap `.env` key is
 * configured — i.e. the deployment has no usable LLM credentials at all. Callers that want a
 * soft path (boot-time smoke tests, seeds) should catch exactly this class.
 */
export class LlmNotConfiguredError extends Error {
  constructor(context: string) {
    super(
      `No LLM provider is configured for ${context} — add a provider, API key, and model in the ` +
        'admin LLM settings (and optionally set a global task default).',
    );
    this.name = 'LlmNotConfiguredError';
  }
}

/** Bootstrap tier's literal model per task — the exact static values every call site hardcoded before this change. */
const BOOTSTRAP_MODEL_BY_TASK: Record<LlmTask, string> = {
  content_generation: LLM_MODELS.content,
  chat: LLM_MODELS.standard,
  categorization: LLM_MODELS.standard,
  dedup_adjudication: LLM_MODELS.standard,
  style_card: LLM_MODELS.standard,
  critique: LLM_MODELS.content,
  fact_extraction: LLM_MODELS.standard,
  embedding: config.embedding_model as string,
};

const requiredCapability = (task: LlmTask): LlmModelCapability => (task === 'embedding' ? 'embedding' : 'chat');

const resolveBootstrap = (task: LlmTask): ResolvedModel => {
  // The bootstrap tier only exists while a legacy/test OPENROUTER_API_KEY is present in the
  // environment (`.env.test` sets one for the mocked Jest suite). Real deployments configure
  // providers/keys/models in-app, so falling through every DB tier with no env key is a
  // configuration error worth surfacing loudly, not something to paper over.
  if (!config.openrouter_api_key) {
    throw new LlmNotConfiguredError(`task "${task}"`);
  }
  return {
    source: 'bootstrap',
    provider_type: 'openrouter',
    model_id: BOOTSTRAP_MODEL_BY_TASK[task],
    api_key: config.openrouter_api_key,
  };
};

/**
 * Loads an `LlmModel` by id and validates it end-to-end for `task`: the model must exist, be
 * active, have the required capability; its parent provider must exist, be active, and have at
 * least one active key (other than `excludeKeyId`, if set). Any failure logs a warning and
 * returns `null` — soft-fail-through, never a thrown error, matching `resolveStylePack`'s
 * philosophy elsewhere in this codebase.
 */
const tryResolveFromModelId = async (
  llmModelId: string,
  task: LlmTask,
  source: 'request' | 'team' | 'global',
  excludeKeyId?: string,
): Promise<ResolvedModel | null> => {
  if (!Types.ObjectId.isValid(llmModelId)) {
    logger.warn({ task, source, llmModelId }, '[modelResolution] llm_model_id is not a valid ObjectId, falling through');
    return null;
  }

  const model = await LlmModel.findById(llmModelId);
  if (!model || !model.is_active) {
    logger.warn({ task, source, llmModelId }, '[modelResolution] LlmModel not found or inactive, falling through');
    return null;
  }

  const capability = requiredCapability(task);
  if (!model.capabilities.includes(capability)) {
    logger.warn(
      { task, source, llmModelId, capability, modelCapabilities: model.capabilities },
      '[modelResolution] LlmModel lacks the required capability for this task, falling through',
    );
    return null;
  }

  const provider = await LlmProvider.findById(model.provider_id).select('+keys.encrypted_key');
  if (!provider || !provider.is_active) {
    logger.warn(
      { task, source, llmModelId, providerId: model.provider_id },
      '[modelResolution] LlmProvider not found or inactive, falling through',
    );
    return null;
  }

  const key = provider.keys.find((k) => k.is_active && (!excludeKeyId || k._id.toString() !== excludeKeyId));
  if (!key) {
    logger.warn(
      { task, source, llmModelId, providerId: provider._id, excludeKeyId },
      '[modelResolution] LlmProvider has no available active key, falling through',
    );
    return null;
  }

  return {
    source,
    provider_type: provider.provider_type,
    model_id: model.model_id,
    api_key: decrypt(key.encrypted_key),
    key_id: key._id.toString(),
  };
};

/**
 * Resolves a model/provider/key for `task` via, in order: request override, the requesting
 * team's `default_models[task]`, a global super-admin-set default for that task, and a bootstrap
 * `.env`-configured fallback. Every tier is validated before being accepted; an invalid/inactive
 * reference at any tier soft-fails through to the next tier rather than throwing. If every DB
 * tier falls through and no bootstrap env key is set, this rejects with LlmNotConfiguredError.
 */
export const resolveModelForTask = async (task: LlmTask, context: ResolveContext = {}): Promise<ResolvedModel> => {
  const { teamId, requestModelId, excludeKeyId } = context;

  if (requestModelId) {
    const resolved = await tryResolveFromModelId(requestModelId, task, 'request', excludeKeyId);
    if (resolved) return resolved;
  }

  if (teamId) {
    const team = await Team.findById(teamId).select('default_models');
    const teamModelId = team?.default_models?.[task];
    if (teamModelId) {
      const resolved = await tryResolveFromModelId(teamModelId, task, 'team', excludeKeyId);
      if (resolved) return resolved;
    }
  }

  const globalDefault = await LlmTaskDefault.findOne({ task });
  if (globalDefault) {
    const resolved = await tryResolveFromModelId(globalDefault.llm_model_id.toString(), task, 'global', excludeKeyId);
    if (resolved) return resolved;
  }

  return resolveBootstrap(task);
};

export interface TaskCallOptions {
  teamId?: string;
  requestModelId?: string;
  temperature?: number;
}

/**
 * Chat completion resolved dynamically for `task`. Bootstrap tier delegates to the existing,
 * unmodified static `chatCompletion` (including its own `LLM_MODEL_FALLBACK` retry) — true
 * behavioral identity with today for any deployment with zero `LlmProvider` records configured.
 * Non-bootstrap tiers retry once on a failure, re-resolving with the failed key excluded so the
 * retry lands on a genuinely different key/provider rather than deterministically failing again.
 */
export const chatCompletionForTask = async (
  task: LlmTask,
  messages: AdapterChatMessage[],
  opts: TaskCallOptions = {},
): Promise<string> => {
  const resolved = await resolveModelForTask(task, opts);
  const temperature = opts.temperature ?? 0.7;

  if (resolved.source === 'bootstrap') {
    return chatCompletion({ model: resolved.model_id, messages: messages as ChatMessage[], temperature });
  }

  try {
    return await getAdapter(resolved.provider_type, resolved.api_key).chatCompletion(resolved.model_id, messages, temperature);
  } catch (primaryErr) {
    logger.warn(
      {
        task,
        provider: resolved.provider_type,
        model: resolved.model_id,
        err: primaryErr instanceof Error ? primaryErr.message : primaryErr,
      },
      '[modelResolution] Resolved chat completion failed, attempting failover to the next available key',
    );

    let retry: ResolvedModel;
    try {
      retry = await resolveModelForTask(task, { ...opts, excludeKeyId: resolved.key_id });
    } catch {
      // Nothing left to fail over to (e.g. single key, no bootstrap env key) — the original
      // provider failure is the error worth reporting, not the resolution fallthrough.
      throw primaryErr;
    }
    if (retry.key_id === resolved.key_id) {
      throw primaryErr;
    }
    if (retry.source === 'bootstrap') {
      return chatCompletion({ model: retry.model_id, messages: messages as ChatMessage[], temperature });
    }
    return getAdapter(retry.provider_type, retry.api_key).chatCompletion(retry.model_id, messages, temperature);
  }
};

/**
 * Streaming chat completion resolved dynamically for `task`.
 *
 * Failover differs from `chatCompletionForTask` on purpose, and the difference is the whole reason
 * this is a separate function rather than a flag. Once a token has been handed to the caller it has
 * usually already been written to the client's socket, so retrying on another key would splice two
 * different completions into one answer. Failover therefore applies **only before the first token**:
 * a provider that fails at connect time is retried on the next available key; one that dies
 * mid-stream surfaces the error, and the caller decides what a partial answer means.
 *
 * Falls back to the buffered call — yielding the whole answer as one chunk — for a bootstrap-tier
 * resolution or a provider whose adapter has no `streamChatCompletion`. Callers get a uniform
 * AsyncIterable either way and never branch on provider capability.
 */
export async function* streamChatCompletionForTask(
  task: LlmTask,
  messages: AdapterChatMessage[],
  opts: TaskCallOptions = {},
): AsyncGenerator<string> {
  const temperature = opts.temperature ?? 0.7;
  const resolved = await resolveModelForTask(task, opts);

  const openStream = async (r: ResolvedModel): Promise<AsyncIterable<string> | null> => {
    if (r.source === 'bootstrap') return null;
    const adapter = getAdapter(r.provider_type, r.api_key);
    if (!adapter.streamChatCompletion) return null;
    return adapter.streamChatCompletion(r.model_id, messages, temperature);
  };

  let stream: AsyncIterable<string> | null;
  try {
    stream = await openStream(resolved);
  } catch (primaryErr) {
    logger.warn(
      {
        task,
        provider: resolved.provider_type,
        model: resolved.model_id,
        err: primaryErr instanceof Error ? primaryErr.message : primaryErr,
      },
      '[modelResolution] Resolved stream failed to open, attempting failover to the next available key',
    );

    let retry: ResolvedModel;
    try {
      retry = await resolveModelForTask(task, { ...opts, excludeKeyId: resolved.key_id });
    } catch {
      throw primaryErr;
    }
    if (retry.key_id === resolved.key_id) throw primaryErr;
    stream = await openStream(retry);
  }

  if (!stream) {
    // No streaming path available — emit the buffered answer as a single chunk so the caller's
    // consumption code is identical.
    yield await chatCompletionForTask(task, messages, opts);
    return;
  }

  yield* stream;
}

export interface EmbedTaskCallOptions {
  teamId?: string;
  requestModelId?: string;
}

/** Single-text embedding resolved dynamically for `task`. Mirrors `chatCompletionForTask` exactly. */
export const embedForTask = async (task: LlmTask, text: string, opts: EmbedTaskCallOptions = {}): Promise<number[]> => {
  const resolved = await resolveModelForTask(task, opts);

  if (resolved.source === 'bootstrap') {
    return embed(text);
  }

  try {
    return await getAdapter(resolved.provider_type, resolved.api_key).embed(resolved.model_id, text);
  } catch (primaryErr) {
    logger.warn(
      {
        task,
        provider: resolved.provider_type,
        model: resolved.model_id,
        err: primaryErr instanceof Error ? primaryErr.message : primaryErr,
      },
      '[modelResolution] Resolved embedding failed, attempting failover to the next available key',
    );

    let retry: ResolvedModel;
    try {
      retry = await resolveModelForTask(task, { ...opts, excludeKeyId: resolved.key_id });
    } catch {
      // Nothing left to fail over to (e.g. single key, no bootstrap env key) — the original
      // provider failure is the error worth reporting, not the resolution fallthrough.
      throw primaryErr;
    }
    if (retry.key_id === resolved.key_id) {
      throw primaryErr;
    }
    if (retry.source === 'bootstrap') {
      return embed(text);
    }
    return getAdapter(retry.provider_type, retry.api_key).embed(retry.model_id, text);
  }
};

/** Batch embedding resolved dynamically for `task`. Mirrors `chatCompletionForTask` exactly. */
export const embedBatchForTask = async (
  task: LlmTask,
  texts: string[],
  opts: EmbedTaskCallOptions = {},
): Promise<number[][]> => {
  if (texts.length === 0) return [];

  const resolved = await resolveModelForTask(task, opts);

  if (resolved.source === 'bootstrap') {
    return embedBatch(texts);
  }

  try {
    return await getAdapter(resolved.provider_type, resolved.api_key).embedBatch(resolved.model_id, texts);
  } catch (primaryErr) {
    logger.warn(
      {
        task,
        provider: resolved.provider_type,
        model: resolved.model_id,
        err: primaryErr instanceof Error ? primaryErr.message : primaryErr,
      },
      '[modelResolution] Resolved batch embedding failed, attempting failover to the next available key',
    );

    let retry: ResolvedModel;
    try {
      retry = await resolveModelForTask(task, { ...opts, excludeKeyId: resolved.key_id });
    } catch {
      // Nothing left to fail over to (e.g. single key, no bootstrap env key) — the original
      // provider failure is the error worth reporting, not the resolution fallthrough.
      throw primaryErr;
    }
    if (retry.key_id === resolved.key_id) {
      throw primaryErr;
    }
    if (retry.source === 'bootstrap') {
      return embedBatch(texts);
    }
    return getAdapter(retry.provider_type, retry.api_key).embedBatch(retry.model_id, texts);
  }
};

/**
 * Narrow helper for the bake-off harness's per-cell literal-model comparison
 * (`contentGeneration.bakeoff.ts`) — explicitly NOT part of task-based default resolution (see
 * design.md Non-Goals). Its job is routing a caller-supplied literal model string to the right
 * provider, not picking a model for a task: checks the `LlmModel` catalog for a matching
 * `model_id`; falls back to OpenRouter + the bootstrap key if not found, preserving 100% of
 * today's OpenRouter-only bake-off behavior when the catalog is empty.
 */
export const resolveProviderForLiteralModel = async (modelId: string): Promise<ResolvedModel> => {
  const model = await LlmModel.findOne({ model_id: modelId, is_active: true, capabilities: 'chat' });
  if (model) {
    const provider = await LlmProvider.findById(model.provider_id).select('+keys.encrypted_key');
    const key = provider?.is_active ? provider.keys.find((k) => k.is_active) : undefined;
    if (provider && key) {
      return {
        source: 'global',
        provider_type: provider.provider_type,
        model_id: model.model_id,
        api_key: decrypt(key.encrypted_key),
        key_id: key._id.toString(),
      };
    }
  }

  if (!config.openrouter_api_key) {
    throw new LlmNotConfiguredError(`literal model "${modelId}"`);
  }
  return {
    source: 'bootstrap',
    provider_type: 'openrouter',
    model_id: modelId,
    api_key: config.openrouter_api_key,
  };
};
