import { RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import config from '../config';
import { redis } from '../lib/redis';
import { httpStatus } from '../utils/httpStatus';
import { getBudgetStatus } from '../modules/LlmUsage/llmUsage.budget';

/**
 * Three tiers of rate limiting, all backed by the Redis this deployment already runs so the counters
 * are shared across replicas rather than per-process.
 *
 * Why three and not one: the risks are different. `auth` protects credentials from brute force and is
 * keyed by IP because there is no authenticated user yet. `global` is a broad per-user politeness
 * ceiling. `llm` is the one that protects money — `/content/generate` fires up to five sequential
 * provider calls per request, so an unbounded caller spends the budget directly — and it is keyed by
 * team, because that is the unit the spend is attributable to.
 *
 * `RATE_LIMIT_ENABLED=false` turns all of them into pass-throughs. The integration suite needs that:
 * dozens of logins from one address in a single run is the test, not abuse.
 */

const passThrough: RequestHandler = (_req, _res, next) => next();

const store = () =>
  new RedisStore({
    // node-redis-style call signature expected by rate-limit-redis, mapped onto ioredis.
    sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
  });

const build = (options: Partial<Options> & Pick<Options, 'windowMs' | 'limit'>): RequestHandler => {
  if (!config.rate_limit.enabled) return passThrough;

  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    statusCode: httpStatus.TOO_MANY_REQUESTS,
    store: store(),
    ...options,
  });
};

/**
 * Credential endpoints: login, forgot-password, reset-password. Keyed by IP via the library's own
 * `ipKeyGenerator`, which normalizes IPv6 (a naive `req.ip` key lets one host cycle addresses within
 * its /64 and get a fresh bucket each time).
 *
 * `skipSuccessfulRequests` means a legitimate user signing in repeatedly is never locked out — only
 * failures consume the budget, which is exactly the brute-force signal.
 */
export const authRateLimiter = build({
  windowMs: config.rate_limit.auth.window_ms,
  limit: config.rate_limit.auth.max,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `rl:auth:${ipKeyGenerator(req.ip ?? '')}`,
  message: { success: false, message: 'Too many attempts. Wait a few minutes and try again.' },
});

/**
 * Broad ceiling across the whole API, mounted app-wide. Keyed by IP, not user: it runs before any
 * route's `requireAuth`, so `req.user` is never populated at this point — keying by user here would
 * silently collapse every caller into one bucket.
 */
export const globalRateLimiter = build({
  windowMs: config.rate_limit.global.window_ms,
  limit: config.rate_limit.global.max,
  keyGenerator: (req) => `rl:global:${ipKeyGenerator(req.ip ?? '')}`,
  message: { success: false, message: 'Too many requests. Slow down and try again shortly.' },
});

/**
 * Per-team daily budget for provider-spending endpoints. Falls back to the user id when no team is
 * resolvable from the request, so a malformed payload can't slip past by omitting `team_id`.
 *
 * Must run after `requireAuth` — it reads `req.user`.
 */
export const llmRateLimiter = build({
  windowMs: config.rate_limit.llm.window_ms,
  limit: config.rate_limit.llm.max,
  keyGenerator: (req) => {
    const body = req.body as { team_id?: unknown } | undefined;
    const teamId = typeof body?.team_id === 'string' ? body.team_id : undefined;
    if (teamId) return `rl:llm:t:${teamId}`;
    return req.user ? `rl:llm:u:${req.user.id}` : `rl:llm:ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  message: {
    success: false,
    message: 'This team has reached its daily AI generation limit. It resets in 24 hours.',
  },
});

/**
 * Per-team daily **token** ceiling, alongside the request counter above (Phase 2.8).
 *
 * Both exist because they catch different abuse. The request limiter stops a loop hammering the
 * endpoint; this stops a small number of very expensive calls — one question carrying a full
 * context costs what fifty trivial ones do, so a request quota can be entirely respected while the
 * bill runs away.
 *
 * Enforced *before* the call, since a refusal is only useful if it prevents the spend. That means it
 * checks what has already been recorded, so the call that crosses the line is allowed through and
 * the next one is refused — a bounded overshoot of one request, which is the price of not blocking
 * on a token count nobody can know in advance.
 *
 * Disabled when `RATE_LIMIT_LLM_DAILY_TOKENS` is 0 (the default), so an existing deployment is
 * unaffected until an operator opts in.
 */
export const llmTokenBudget: RequestHandler = (req, res, next) => {
  if (!config.rate_limit.enabled || config.rate_limit.llm.daily_tokens <= 0) {
    next();
    return;
  }

  const body = req.body as { team_id?: unknown } | undefined;
  const teamId =
    typeof body?.team_id === 'string' ? body.team_id : (req.user?.team_ids?.[0] ?? null);

  void getBudgetStatus(teamId).then((status) => {
    if (!status.exceeded) {
      // Advisory headers, mirroring what the request limiter's `draft-7` headers do for requests.
      res.setHeader('X-Token-Budget-Limit', String(status.limit));
      res.setHeader('X-Token-Budget-Remaining', String(status.remaining));
      next();
      return;
    }

    res.status(httpStatus.TOO_MANY_REQUESTS).json({
      success: false,
      message:
        'This team has used its daily AI token budget. It resets at midnight UTC — or ask an admin to raise the limit.',
    });
  });
};
