import { logger } from '../../lib/logger';
import { LlmUsage } from '../LlmProvider/llmProvider.adapters';
import { LlmProviderType, LlmTask } from '../LlmProvider/llmProvider.interface';
import {
  ILlmUsageDaily,
  LlmUsageOperation,
  LlmUsageTier,
} from './llmUsage.interface';
import { LlmUsageDaily, LlmUsageEvent } from './llmUsage.model';
import { addTokenSpend, totalTokens } from './llmUsage.budget';

export interface RecordUsageInput {
  teamId?: string;
  task: LlmTask;
  operation: LlmUsageOperation;
  tier: LlmUsageTier;
  providerType: LlmProviderType;
  model: string;
  keyId?: string;
  /** Absent when the provider reported nothing — recorded as `usage_reported: false`. */
  usage?: LlmUsage;
  durationMs: number;
  /** USD per 1M tokens, from the resolved `LlmModel`. Both absent ⇒ no cost is estimated. */
  inputCostPer1m?: number;
  outputCostPer1m?: number;
}

/** UTC `YYYY-MM-DD`. Deliberately not local time: a rollup bucket must not shift with the host. */
export const utcDateKey = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * Cost in USD, or `undefined` when the model has no pricing configured.
 *
 * Cached prompt tokens are *not* discounted here. Every provider prices them differently (Anthropic
 * bills cache reads at a tenth, OpenAI at a half, OpenRouter varies by upstream), and inventing a
 * ratio would make the number confidently wrong. The uncached figure is a defensible ceiling, and
 * `cached_prompt_tokens` is stored alongside it so the real saving is still measurable.
 */
export const estimateCostUsd = (
  usage: LlmUsage | undefined,
  inputCostPer1m?: number,
  outputCostPer1m?: number,
): number | undefined => {
  if (!usage) return undefined;
  if (inputCostPer1m === undefined && outputCostPer1m === undefined)
    return undefined;

  const input = (usage.prompt_tokens / 1_000_000) * (inputCostPer1m ?? 0);
  const output = (usage.completion_tokens / 1_000_000) * (outputCostPer1m ?? 0);
  return input + output;
};

/**
 * Records one provider call: a raw event row plus an `$inc` into the day's rollup.
 *
 * **Never throws and is never awaited on the request path.** Metering is bookkeeping about a call
 * that already succeeded — letting a Mongo hiccup turn a delivered answer into a 500 would trade a
 * real feature for an accounting detail. Failures are logged and dropped.
 */
export const recordLlmUsage = async (
  input: RecordUsageInput,
): Promise<void> => {
  try {
    const teamId = input.teamId ?? null;
    const usage = input.usage;
    const estimated = estimateCostUsd(
      usage,
      input.inputCostPer1m,
      input.outputCostPer1m,
    );
    const now = new Date();

    await LlmUsageEvent.create({
      team_id: teamId,
      task: input.task,
      operation: input.operation,
      tier: input.tier,
      provider_type: input.providerType,
      model: input.model,
      key_id: input.keyId,
      prompt_tokens: usage?.prompt_tokens,
      completion_tokens: usage?.completion_tokens,
      cached_prompt_tokens: usage?.cached_prompt_tokens,
      estimated_cost_usd: estimated,
      duration_ms: input.durationMs,
      usage_reported: Boolean(usage),
      created_at: now,
    });

    // Feeds the Phase 2.8 ceiling. Same numbers as the ledger row above, kept in Redis so the
    // pre-flight check never has to aggregate Mongo.
    await addTokenSpend(
      teamId,
      totalTokens(usage?.prompt_tokens, usage?.completion_tokens),
    );

    await LlmUsageDaily.updateOne(
      {
        team_id: teamId,
        date: utcDateKey(now),
        task: input.task,
        model: input.model,
      },
      {
        $inc: {
          calls: 1,
          calls_without_usage: usage ? 0 : 1,
          prompt_tokens: usage?.prompt_tokens ?? 0,
          completion_tokens: usage?.completion_tokens ?? 0,
          cached_prompt_tokens: usage?.cached_prompt_tokens ?? 0,
          estimated_cost_usd: estimated ?? 0,
        },
        $set: { updated_at: now },
      },
      { upsert: true },
    );
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : err,
        task: input.task,
        model: input.model,
      },
      '[llmUsage] failed to record usage — the provider call itself succeeded',
    );
  }
};

/**
 * In-flight recordings. Tracked rather than truly forgotten so there is a way to wait for them:
 * on shutdown, to avoid discarding the last few rows when the process exits mid-write, and in
 * tests, which would otherwise race the write they are asserting on.
 */
const pending = new Set<Promise<void>>();

/** Fire-and-forget wrapper, so a call site never has to remember not to await. */
export const recordLlmUsageAsync = (input: RecordUsageInput): void => {
  const task = recordLlmUsage(input).finally(() => pending.delete(task));
  pending.add(task);
};

/**
 * Waits for every in-flight recording to settle.
 *
 * `recordLlmUsage` never rejects, so this cannot throw. Loops because a recording can in principle
 * be enqueued while an earlier batch is still settling.
 */
export const flushLlmUsage = async (): Promise<void> => {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
};

export interface UsageSummaryQuery {
  teamId?: string;
  /** Inclusive UTC `YYYY-MM-DD` bounds. */
  from?: string;
  to?: string;
}

export interface UsageBucket {
  key: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_prompt_tokens: number;
  estimated_cost_usd: number;
}

export interface UsageSummary {
  totals: {
    calls: number;
    calls_without_usage: number;
    prompt_tokens: number;
    completion_tokens: number;
    cached_prompt_tokens: number;
    estimated_cost_usd: number;
  };
  by_task: UsageBucket[];
  by_day: UsageBucket[];
}

const DEFAULT_WINDOW_DAYS = 30;

const emptyBucket = (key: string): UsageBucket => ({
  key,
  calls: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  cached_prompt_tokens: 0,
  estimated_cost_usd: 0,
});

const addInto = (bucket: UsageBucket, row: ILlmUsageDaily): void => {
  bucket.calls += row.calls;
  bucket.prompt_tokens += row.prompt_tokens;
  bucket.completion_tokens += row.completion_tokens;
  bucket.cached_prompt_tokens += row.cached_prompt_tokens;
  bucket.estimated_cost_usd += row.estimated_cost_usd;
};

/**
 * Reads the rollup, never the event rows — the whole point of maintaining a rollup is that this
 * query stays O(days × tasks × models) instead of O(provider calls).
 */
export const getUsageSummary = async (
  query: UsageSummaryQuery,
): Promise<UsageSummary> => {
  const to = query.to ?? utcDateKey(new Date());
  const from =
    query.from ??
    utcDateKey(
      new Date(
        Date.parse(`${to}T00:00:00Z`) - DEFAULT_WINDOW_DAYS * 24 * 3600 * 1000,
      ),
    );

  const rows = await LlmUsageDaily.find({
    ...(query.teamId ? { team_id: query.teamId } : {}),
    date: { $gte: from, $lte: to },
  }).lean();

  const totals = {
    calls: 0,
    calls_without_usage: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    cached_prompt_tokens: 0,
    estimated_cost_usd: 0,
  };
  const byTask = new Map<string, UsageBucket>();
  const byDay = new Map<string, UsageBucket>();

  for (const row of rows) {
    totals.calls += row.calls;
    totals.calls_without_usage += row.calls_without_usage;
    totals.prompt_tokens += row.prompt_tokens;
    totals.completion_tokens += row.completion_tokens;
    totals.cached_prompt_tokens += row.cached_prompt_tokens;
    totals.estimated_cost_usd += row.estimated_cost_usd;

    if (!byTask.has(row.task)) byTask.set(row.task, emptyBucket(row.task));
    addInto(byTask.get(row.task) as UsageBucket, row);

    if (!byDay.has(row.date)) byDay.set(row.date, emptyBucket(row.date));
    addInto(byDay.get(row.date) as UsageBucket, row);
  }

  return {
    totals,
    by_task: [...byTask.values()].sort((a, b) => b.calls - a.calls),
    by_day: [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
};

export const LlmUsageService = {
  recordLlmUsage,
  recordLlmUsageAsync,
  flushLlmUsage,
  getUsageSummary,
  estimateCostUsd,
  utcDateKey,
};
