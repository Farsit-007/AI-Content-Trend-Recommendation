import config from '../../config';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { utcDateKey } from './llmUsage.service';

/**
 * Per-team daily token ceiling (Phase 2.8).
 *
 * The existing `llmRateLimiter` counts *requests*, which is only loosely related to spend: one
 * question carrying a 4000-token context costs what fifty trivial ones do, and a team can exhaust a
 * budget while sitting comfortably inside a request quota. This counts the thing actually being
 * billed.
 *
 * Kept in Redis rather than read from `llm_usage_daily` because it is consulted before every
 * provider call and must not add a Mongo aggregation to that path. The two can drift slightly — the
 * counter is incremented from the same usage the ledger records, but a Redis outage skips the
 * increment — and that is the right trade: the ledger is the accounting record, this is a
 * fast-and-approximate guard rail.
 */

const DAY_SECONDS = 24 * 3600;

const budgetKey = (teamId: string, day: string): string => `llm:tokens:${teamId}:${day}`;

/** Both halves of the bill. Cached reads still cost, just less, so they are not discounted here. */
export const totalTokens = (promptTokens = 0, completionTokens = 0): number =>
  promptTokens + completionTokens;

/**
 * Adds a call's tokens to today's counter.
 *
 * Never throws: a metering failure must not fail a request that already succeeded, exactly as in
 * `recordLlmUsage`. TTL is set on every increment rather than only on creation — `EXPIRE` on an
 * existing key is cheap, and it means a key can never be left without one by a crash between
 * `INCRBY` and `EXPIRE`.
 */
export const addTokenSpend = async (teamId: string | null, tokens: number): Promise<void> => {
  if (!teamId || tokens <= 0 || config.rate_limit.llm.daily_tokens <= 0) return;

  try {
    const key = budgetKey(teamId, utcDateKey(new Date()));
    await redis.incrby(key, tokens);
    await redis.expire(key, DAY_SECONDS * 2);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, teamId },
      '[llmBudget] could not record token spend — the provider call itself succeeded',
    );
  }
};

export interface BudgetStatus {
  limit: number;
  spent: number;
  remaining: number;
  exceeded: boolean;
}

/**
 * Today's spend against the ceiling.
 *
 * Fails **open**: if Redis cannot answer, the request proceeds. A cache outage taking down every
 * team's chat and generation would be a worse failure than briefly not enforcing a soft ceiling —
 * and the ledger still records what was spent, so nothing becomes invisible.
 */
export const getBudgetStatus = async (teamId: string | null): Promise<BudgetStatus> => {
  const limit = config.rate_limit.llm.daily_tokens;
  if (!teamId || limit <= 0) {
    return { limit, spent: 0, remaining: Number.POSITIVE_INFINITY, exceeded: false };
  }

  try {
    const raw = await redis.get(budgetKey(teamId, utcDateKey(new Date())));
    const spent = raw ? Number(raw) : 0;
    return { limit, spent, remaining: Math.max(0, limit - spent), exceeded: spent >= limit };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, teamId },
      '[llmBudget] could not read token spend — failing open',
    );
    return { limit, spent: 0, remaining: limit, exceeded: false };
  }
};
