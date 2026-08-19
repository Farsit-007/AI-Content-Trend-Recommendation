import { RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import config from '../config';
import { redis } from '../lib/redis';
import { httpStatus } from '../utils/httpStatus';

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
    message: "This team has reached its daily AI generation limit. It resets in 24 hours.",
  },
});
