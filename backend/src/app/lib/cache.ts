import { logger } from './logger';
import { redis } from './redis';

/**
 * Cache-aside helper (Phase 3).
 *
 * Redis was already a dependency but only ever held locks, counters, and two feature-specific
 * caches. Meanwhile `isTeamReady()` ran two queries on every feed *and* chat request, model
 * resolution re-read the provider catalogue before every LLM call, and the team document was
 * fetched several times per request by different callers. This is the missing shared layer.
 *
 * Three properties, each learned from something already in this codebase:
 *
 *  - **Degrade open.** Every Redis call is wrapped. A cache outage becomes a slow request, never a
 *    failed one — the same discipline `lib/llmKeyHealth.ts` already applies to key cooldowns.
 *  - **Namespaced and versioned.** Keys carry a schema version so a deploy that changes a cached
 *    shape cannot serve last release's structure to this release's code.
 *  - **Observable.** Hit/miss counters per domain, because a cache you cannot measure is a cache
 *    you cannot tune — and a silently-always-missing cache looks exactly like a working one.
 */

/**
 * Bump when the *shape* of anything cached here changes. Cheaper and safer than hunting down
 * individual keys, and it makes a rollback safe too: the old build reads its own namespace.
 */
const CACHE_VERSION = 'v1';

export type CacheDomain =
  | 'team'
  | 'team:ready'
  | 'team:voice'
  | 'llm:resolve'
  | 'stylepacks'
  | 'chat:ctx'
  | 'feed';

const stats = new Map<CacheDomain, { hits: number; misses: number; errors: number }>();

const bump = (domain: CacheDomain, field: 'hits' | 'misses' | 'errors'): void => {
  const entry = stats.get(domain) ?? { hits: 0, misses: 0, errors: 0 };
  entry[field] += 1;
  stats.set(domain, entry);
};

export interface CacheDomainStats {
  hits: number;
  misses: number;
  errors: number;
  hitRate: number;
}

/** Snapshot for `/health` and the admin panel. Process-local, so it resets on deploy. */
export const cacheStats = (): Record<string, CacheDomainStats> => {
  const out: Record<string, CacheDomainStats> = {};
  for (const [domain, s] of stats) {
    const total = s.hits + s.misses;
    out[domain] = { ...s, hitRate: total === 0 ? 0 : Number((s.hits / total).toFixed(3)) };
  }
  return out;
};

/** Test-only: the counters are process-local, so a suite asserting on them needs a clean slate. */
export const resetCacheStats = (): void => {
  stats.clear();
};

const buildKey = (domain: CacheDomain, id: string): string => `gs:${CACHE_VERSION}:${domain}:${id}`;

/**
 * Reads through the cache, computing and storing on a miss.
 *
 * `null` and `undefined` results are **not** cached. Both usually mean "not found yet", and caching
 * them turns a transient miss into a sticky one — the shape of bug where a team that just added its
 * first brand-voice example still reads as not-ready for the next minute.
 */
export const cached = async <T>(
  domain: CacheDomain,
  id: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> => {
  const key = buildKey(domain, id);

  try {
    const raw = await redis.get(key);
    if (raw !== null) {
      bump(domain, 'hits');
      return JSON.parse(raw) as T;
    }
    bump(domain, 'misses');
  } catch (err) {
    bump(domain, 'errors');
    logger.warn(
      { err: err instanceof Error ? err.message : err, key },
      '[cache] read failed — computing directly',
    );
  }

  const value = await compute();

  if (value !== null && value !== undefined) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      bump(domain, 'errors');
      logger.warn(
        { err: err instanceof Error ? err.message : err, key },
        '[cache] write failed — value still returned',
      );
    }
  }

  return value;
};

/** Drops one entry. Call from the write path that invalidates it, not on a timer. */
export const invalidate = async (domain: CacheDomain, id: string): Promise<void> => {
  try {
    await redis.del(buildKey(domain, id));
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, domain, id },
      '[cache] invalidate failed',
    );
  }
};

/**
 * Drops every entry in a domain, via `SCAN` rather than `KEYS`.
 *
 * `KEYS` blocks the single Redis thread for the whole scan, which on a large keyspace stalls every
 * other request — including the rate limiters and job locks that share this instance.
 */
export const invalidateDomain = async (domain: CacheDomain): Promise<void> => {
  const pattern = buildKey(domain, '*');
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, domain },
      '[cache] domain invalidate failed',
    );
  }
};
