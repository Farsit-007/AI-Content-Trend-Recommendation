import { logger } from './logger';
import { redis } from './redis';
import { LlmErrorKind } from './llmErrors';

/**
 * Per-key health, kept in Redis rather than Mongo on purpose: a cooldown is ephemeral, expires on
 * its own, and is written on every rate-limited call. Mongo would mean a document write per 429 and
 * a read on the hot path of every LLM call, to store something whose whole lifetime is measured in
 * seconds.
 *
 * Every function here **degrades open**. If Redis is unavailable the resolver must keep serving
 * traffic on its normal key order — a cache outage turning into a total LLM outage would be a far
 * worse failure than the one this module exists to soften.
 */

const cooldownKey = (keyId: string) => `llm:key:cd:${keyId}`;
const rotationKey = (providerId: string) => `llm:key:rr:${providerId}`;
const failureCountKey = (keyId: string) => `llm:key:fails:${keyId}`;

/** Failure counters are for observability only, so a day is long enough to be useful and short enough to self-clean. */
const FAILURE_COUNTER_TTL_SECONDS = 24 * 60 * 60;

export interface KeyCooldown {
  key_id: string;
  /** Milliseconds until this key is eligible again. */
  remaining_ms: number;
  reason: LlmErrorKind;
}

/**
 * Takes one key out of rotation for `ms`. The value stores the reason so the admin UI can say
 * *why* a key is resting rather than just that it is.
 */
export const markKeyCooldown = async (
  keyId: string,
  ms: number,
  reason: LlmErrorKind,
): Promise<void> => {
  if (ms <= 0) return;
  try {
    await redis.set(cooldownKey(keyId), reason, 'PX', Math.ceil(ms));
    await redis.incr(failureCountKey(keyId));
    await redis.expire(failureCountKey(keyId), FAILURE_COUNTER_TTL_SECONDS);
    logger.warn(
      { keyId, reason, cooldownMs: Math.ceil(ms) },
      '[llmKeyHealth] key placed on cooldown',
    );
  } catch (err) {
    logger.warn(
      { keyId, reason, err: err instanceof Error ? err.message : err },
      '[llmKeyHealth] could not record cooldown (Redis unavailable) — key stays in rotation',
    );
  }
};

/**
 * Which of these keys are currently resting. One MGET rather than N round trips, because this sits
 * on the hot path of every resolution.
 */
export const getCoolingDownKeyIds = async (
  keyIds: string[],
): Promise<Set<string>> => {
  if (keyIds.length === 0) return new Set();
  try {
    const values = await redis.mget(keyIds.map(cooldownKey));
    const cooling = new Set<string>();
    values.forEach((value, index) => {
      if (value !== null) cooling.add(keyIds[index]);
    });
    return cooling;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[llmKeyHealth] cooldown lookup failed (Redis unavailable) — treating every key as available',
    );
    return new Set();
  }
};

/** Cooldown detail for the admin UI: remaining time and why, for the keys that have one. */
export const getKeyCooldowns = async (
  keyIds: string[],
): Promise<KeyCooldown[]> => {
  if (keyIds.length === 0) return [];
  try {
    const pipeline = redis.pipeline();
    for (const keyId of keyIds) {
      pipeline.get(cooldownKey(keyId));
      pipeline.pttl(cooldownKey(keyId));
    }
    const results = (await pipeline.exec()) ?? [];

    const cooldowns: KeyCooldown[] = [];
    keyIds.forEach((keyId, index) => {
      const reason = results[index * 2]?.[1] as string | null | undefined;
      const ttl = results[index * 2 + 1]?.[1] as number | null | undefined;
      if (reason && typeof ttl === 'number' && ttl > 0) {
        cooldowns.push({
          key_id: keyId,
          remaining_ms: ttl,
          reason: reason as LlmErrorKind,
        });
      }
    });
    return cooldowns;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[llmKeyHealth] cooldown detail lookup failed (Redis unavailable)',
    );
    return [];
  }
};

/** 24h failure count per key, for the admin UI. Absent/unreadable counters report as 0. */
export const getKeyFailureCounts = async (
  keyIds: string[],
): Promise<Record<string, number>> => {
  if (keyIds.length === 0) return {};
  try {
    const values = await redis.mget(keyIds.map(failureCountKey));
    const counts: Record<string, number> = {};
    keyIds.forEach((keyId, index) => {
      const parsed = Number(values[index]);
      if (Number.isFinite(parsed) && parsed > 0) counts[keyId] = parsed;
    });
    return counts;
  } catch {
    return {};
  }
};

/**
 * Where in the key pool this request should start.
 *
 * Without this, `keys.find(k => k.is_active)` hands every single request to the first key in array
 * order: the pool's first key absorbs 100% of traffic until it rate-limits, so N keys buy roughly
 * 1× the headroom of one key instead of N×. An INCR-and-modulo spreads requests evenly, which is
 * the entire point of holding several keys.
 *
 * Falls back to 0 (today's fixed order) if Redis cannot answer.
 */
/** FNV-1a. Small, dependency-free, and well-spread enough to distribute conversations over a pool. */
const hashToRange = (value: string, range: number): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % range;
};

export const nextRotationOffset = async (
  providerId: string,
  poolSize: number,
  /**
   * When set, the offset is derived from this string instead of the global counter, so every call
   * sharing it lands on the same key.
   *
   * This exists for prompt caching. A provider caches a prefix against the credential that wrote
   * it, so pure round-robin means consecutive turns of one conversation write a cache on key A and
   * then look for it on key B — paying the write every turn and never reading. Pinning by
   * conversation keeps that locality while *different* conversations still spread across the pool,
   * so the rate-limit headroom the pool exists for is preserved in aggregate.
   *
   * Only passed for conversational tasks. One-shot work (categorization, dedup, embeddings) has no
   * cross-call prefix worth preserving and keeps the pure round-robin.
   */
  stickyKey?: string,
): Promise<number> => {
  if (poolSize <= 1) return 0;
  if (stickyKey) return hashToRange(stickyKey, poolSize);
  try {
    const counter = await redis.incr(rotationKey(providerId));
    // Keep the counter from growing without bound over the process's lifetime.
    if (counter > 1_000_000) await redis.set(rotationKey(providerId), '0');
    return (((counter - 1) % poolSize) + poolSize) % poolSize;
  } catch {
    return 0;
  }
};

/** Rotates an array so `offset` becomes its first element. */
export const rotate = <T>(items: T[], offset: number): T[] => {
  if (items.length <= 1) return items;
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
};
