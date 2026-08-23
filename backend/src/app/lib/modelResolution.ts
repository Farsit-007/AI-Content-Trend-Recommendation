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
import { classifyLlmError } from './llmErrors';
import { getCoolingDownKeyIds, markKeyCooldown, nextRotationOffset, rotate } from './llmKeyHealth';

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
interface TierCandidates {
  /** Keys ready to serve, in the order they should be tried. */
  available: ResolvedModel[];
  /** Keys currently on cooldown — a last resort, used only when nothing else is left. */
  cooling: ResolvedModel[];
}

const resolveTierCandidates = async (
  llmModelId: string,
  task: LlmTask,
  source: 'request' | 'team' | 'global',
  excludeKeyId?: string,
): Promise<TierCandidates> => {
  if (!Types.ObjectId.isValid(llmModelId)) {
    logger.warn({ task, source, llmModelId }, '[modelResolution] llm_model_id is not a valid ObjectId, falling through');
    return { available: [], cooling: [] };
  }

  const model = await LlmModel.findById(llmModelId);
  if (!model || !model.is_active) {
    logger.warn({ task, source, llmModelId }, '[modelResolution] LlmModel not found or inactive, falling through');
    return { available: [], cooling: [] };
  }

  const capability = requiredCapability(task);
  if (!model.capabilities.includes(capability)) {
    logger.warn(
      { task, source, llmModelId, capability, modelCapabilities: model.capabilities },
      '[modelResolution] LlmModel lacks the required capability for this task, falling through',
    );
    return { available: [], cooling: [] };
  }

  const provider = await LlmProvider.findById(model.provider_id).select('+keys.encrypted_key');
  if (!provider || !provider.is_active) {
    logger.warn(
      { task, source, llmModelId, providerId: model.provider_id },
      '[modelResolution] LlmProvider not found or inactive, falling through',
    );
    return { available: [], cooling: [] };
  }

  const eligible = provider.keys.filter(
    (k) => k.is_active && (!excludeKeyId || k._id.toString() !== excludeKeyId),
  );
  if (eligible.length === 0) {
    logger.warn(
      { task, source, llmModelId, providerId: provider._id, excludeKeyId },
      '[modelResolution] LlmProvider has no available active key, falling through',
    );
    return { available: [], cooling: [] };
  }

  // Round-robin the starting position so a multi-key pool actually spreads load. Picking
  // `keys[0]` every time means the first key absorbs all traffic and rate-limits on its own while
  // the rest of the pool sits idle.
  const offset = await nextRotationOffset(provider._id.toString(), eligible.length);
  const ordered = rotate(eligible, offset);

  const coolingIds = await getCoolingDownKeyIds(ordered.map((k) => k._id.toString()));
  const toResolved = (k: (typeof ordered)[number]): ResolvedModel => ({
    source,
    provider_type: provider.provider_type,
    model_id: model.model_id,
    api_key: decrypt(k.encrypted_key),
    key_id: k._id.toString(),
  });

  return {
    available: ordered.filter((k) => !coolingIds.has(k._id.toString())).map(toResolved),
    cooling: ordered.filter((k) => coolingIds.has(k._id.toString())).map(toResolved),
  };
};

/**
 * Single best key for a tier — the shape the four-tier resolver and its callers have always used.
 * Prefers a key that is not resting; a cooling-down key is still returned when it is all there is,
 * because reporting *which* model would serve a request must not depend on transient key health.
 */
const tryResolveFromModelId = async (
  llmModelId: string,
  task: LlmTask,
  source: 'request' | 'team' | 'global',
  excludeKeyId?: string,
): Promise<ResolvedModel | null> => {
  const { available, cooling } = await resolveTierCandidates(llmModelId, task, source, excludeKeyId);
  return available[0] ?? cooling[0] ?? null;
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

/**
 * The ordered list of keys this request may try, across every tier.
 *
 * Ordering is deliberate: all *available* keys first (rotated, so load spreads), then the bootstrap
 * env key, then keys that are on cooldown. A resting key goes behind bootstrap because it is known
 * to have just failed, whereas the bootstrap credential is a different account entirely — but it
 * stays in the list, because "every key is resting" must degrade to a likely-429 rather than to a
 * hard outage.
 */
const buildCandidates = async (task: LlmTask, ctx: ResolveContext): Promise<ResolvedModel[]> => {
  const { teamId, requestModelId, excludeKeyId } = ctx;

  const available: ResolvedModel[] = [];
  const cooling: ResolvedModel[] = [];
  const seenKeyIds = new Set<string>();

  const collect = ({ available: ready, cooling: resting }: TierCandidates) => {
    // A key can be reachable from more than one tier (e.g. team and global point at the same
    // model). Deduplicate, or the attempt budget gets spent re-trying one credential.
    for (const candidate of ready) {
      if (candidate.key_id && !seenKeyIds.has(candidate.key_id)) {
        seenKeyIds.add(candidate.key_id);
        available.push(candidate);
      }
    }
    for (const candidate of resting) {
      if (candidate.key_id && !seenKeyIds.has(candidate.key_id)) {
        seenKeyIds.add(candidate.key_id);
        cooling.push(candidate);
      }
    }
  };

  if (requestModelId) {
    collect(await resolveTierCandidates(requestModelId, task, 'request', excludeKeyId));
  }

  if (teamId) {
    const team = await Team.findById(teamId).select('default_models');
    const teamModelId = team?.default_models?.[task];
    if (teamModelId) {
      collect(await resolveTierCandidates(teamModelId, task, 'team', excludeKeyId));
    }
  }

  const globalDefault = await LlmTaskDefault.findOne({ task });
  if (globalDefault) {
    collect(await resolveTierCandidates(globalDefault.llm_model_id.toString(), task, 'global', excludeKeyId));
  }

  const ordered = [...available];
  try {
    ordered.push(resolveBootstrap(task));
  } catch {
    // No bootstrap env key configured — expected for a DB-configured deployment.
  }
  ordered.push(...cooling);

  if (ordered.length === 0) {
    throw new LlmNotConfiguredError(`task "${task}"`);
  }
  return ordered;
};

/**
 * Runs `attempt` against the key pool, moving to the next key when one fails.
 *
 * Three properties matter here, and each replaces a specific weakness of the single-retry version
 * this supersedes:
 *
 * - **The whole pool is reachable.** One retry could only ever reach the second key, so a third or
 *   fourth key was dead weight. Attempts are still capped by `LLM_MAX_KEY_ATTEMPTS` so a large pool
 *   cannot turn one request into a paid call per key.
 * - **A failing key is remembered.** A 429 puts that key on a Redis cooldown, so the *next* request
 *   skips it instead of paying the same rejection again.
 * - **Permanent failures do not fan out.** A 400 or 404 fails identically on every key, so it is
 *   reported immediately rather than burning another billable call to prove it.
 */
const runWithKeyFailover = async <T>(
  task: LlmTask,
  opts: ResolveContext,
  label: string,
  attempt: (resolved: ResolvedModel) => Promise<T>,
): Promise<T> => {
  const candidates = await buildCandidates(task, opts);
  const pool = candidates.slice(0, Math.max(1, config.llm.max_key_attempts));

  let firstErr: unknown;

  for (let index = 0; index < pool.length; index += 1) {
    const candidate = pool[index];
    try {
      return await attempt(candidate);
    } catch (err) {
      if (firstErr === undefined) firstErr = err;

      const classified = classifyLlmError(err);
      if (candidate.key_id && classified.cooldownMs > 0) {
        await markKeyCooldown(candidate.key_id, classified.cooldownMs, classified.kind);
      }

      const context = {
        task,
        label,
        source: candidate.source,
        provider: candidate.provider_type,
        model: candidate.model_id,
        keyId: candidate.key_id,
        status: classified.status,
        kind: classified.kind,
        attempt: index + 1,
        poolSize: pool.length,
        err: err instanceof Error ? err.message : err,
      };

      if (!classified.shouldFailover) {
        logger.warn(context, '[modelResolution] provider call failed permanently — another key cannot help');
        throw err;
      }

      if (index === pool.length - 1) {
        logger.warn(context, '[modelResolution] provider call failed and the key pool is exhausted');
        break;
      }

      logger.warn(context, '[modelResolution] provider call failed, failing over to the next key');
    }
  }

  throw firstErr;
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
  const temperature = opts.temperature ?? 0.7;

  return runWithKeyFailover(task, opts, 'chat completion', (resolved) =>
    // The bootstrap tier keeps delegating to the static client, including its own
    // LLM_MODEL_FALLBACK retry — behavioural identity for a deployment with no providers configured.
    resolved.source === 'bootstrap'
      ? chatCompletion({ model: resolved.model_id, messages: messages as ChatMessage[], temperature })
      : getAdapter(resolved.provider_type, resolved.api_key).chatCompletion(
          resolved.model_id,
          messages,
          temperature,
        ),
  );
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

  const openStream = async (r: ResolvedModel): Promise<AsyncIterable<string> | null> => {
    if (r.source === 'bootstrap') return null;
    const adapter = getAdapter(r.provider_type, r.api_key);
    if (!adapter.streamChatCompletion) return null;
    return adapter.streamChatCompletion(r.model_id, messages, temperature);
  };

  // Opening the stream gets the full pool treatment; everything after the first token does not.
  // `runWithKeyFailover` is deliberately not reused here — it would have to own the iteration too,
  // and a retry once tokens are flowing would splice two different completions into one answer.
  const candidates = (await buildCandidates(task, opts)).slice(0, Math.max(1, config.llm.max_key_attempts));

  type PrimedStream = { iterator: AsyncIterator<string>; first: IteratorResult<string> } | null;

  /**
   * Opens the stream *and pulls its first chunk*.
   *
   * The pull is the load-bearing part. Adapter `streamChatCompletion`s are async generators, so
   * merely calling one returns a generator object without executing a line of its body — a 429 or
   * connection error would surface only once the caller iterated, by which point we are past the
   * point where switching keys is safe. Requesting the first chunk here forces the connection to
   * happen inside the failover loop, which is what makes "fail over before the first token" true
   * rather than aspirational.
   */
  const primeStream = async (r: ResolvedModel): Promise<PrimedStream> => {
    const raw = await openStream(r);
    if (!raw) return null;
    const iterator = raw[Symbol.asyncIterator]();
    const first = await iterator.next();
    return { iterator, first };
  };

  let primed: PrimedStream = null;
  let opened = false;
  let firstErr: unknown;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      primed = await primeStream(candidate);
      opened = true;
      break;
    } catch (err) {
      if (firstErr === undefined) firstErr = err;

      const classified = classifyLlmError(err);
      if (candidate.key_id && classified.cooldownMs > 0) {
        await markKeyCooldown(candidate.key_id, classified.cooldownMs, classified.kind);
      }

      const context = {
        task,
        source: candidate.source,
        provider: candidate.provider_type,
        model: candidate.model_id,
        keyId: candidate.key_id,
        status: classified.status,
        kind: classified.kind,
        attempt: index + 1,
        poolSize: candidates.length,
        err: err instanceof Error ? err.message : err,
      };

      if (!classified.shouldFailover) {
        logger.warn(context, '[modelResolution] stream failed to open permanently — another key cannot help');
        throw err;
      }
      if (index === candidates.length - 1) {
        logger.warn(context, '[modelResolution] stream failed to open and the key pool is exhausted');
        break;
      }
      logger.warn(context, '[modelResolution] stream failed to open, failing over to the next key');
    }
  }

  if (!opened) {
    throw firstErr;
  }

  if (!primed) {
    // No streaming path available — emit the buffered answer as a single chunk so the caller's
    // consumption code is identical.
    yield await chatCompletionForTask(task, messages, opts);
    return;
  }

  // Past this point the answer has started reaching the client, so a failure is surfaced rather
  // than retried: splicing a second completion onto a half-sent one would corrupt the answer.
  if (!primed.first.done) {
    yield primed.first.value;
  }
  for (let next = await primed.iterator.next(); !next.done; next = await primed.iterator.next()) {
    yield next.value;
  }
}

export interface EmbedTaskCallOptions {
  teamId?: string;
  requestModelId?: string;
}

/** Single-text embedding resolved dynamically for `task`. Mirrors `chatCompletionForTask` exactly. */
export const embedForTask = async (task: LlmTask, text: string, opts: EmbedTaskCallOptions = {}): Promise<number[]> => {
  return runWithKeyFailover(task, opts, 'embedding', (resolved) =>
    resolved.source === 'bootstrap'
      ? embed(text)
      : getAdapter(resolved.provider_type, resolved.api_key).embed(resolved.model_id, text),
  );
};

/** Batch embedding resolved dynamically for `task`. Mirrors `chatCompletionForTask` exactly. */
export const embedBatchForTask = async (
  task: LlmTask,
  texts: string[],
  opts: EmbedTaskCallOptions = {},
): Promise<number[][]> => {
  if (texts.length === 0) return [];

  return runWithKeyFailover(task, opts, 'batch embedding', (resolved) =>
    resolved.source === 'bootstrap'
      ? embedBatch(texts)
      : getAdapter(resolved.provider_type, resolved.api_key).embedBatch(resolved.model_id, texts),
  );
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
