import config from '../config';

/**
 * What kind of failure a provider call hit, from the caller's point of view: can another key help,
 * and should the key that produced it be taken out of rotation for a while?
 */
export type LlmErrorKind =
  'rate_limited' | 'exhausted' | 'bad_key' | 'transient' | 'permanent';

export interface ClassifiedLlmError {
  kind: LlmErrorKind;
  status?: number;
  /** How long to keep the offending key out of rotation. 0 means "not the key's fault". */
  cooldownMs: number;
  /** Whether retrying the same request on a *different* key can plausibly succeed. */
  shouldFailover: boolean;
}

/**
 * Reads a header off whatever shape the provider SDK threw. The OpenAI SDK (which the OpenRouter
 * and OpenAI adapters both use) exposes `headers` as either a `Headers` instance or a plain
 * object depending on version and runtime, and the Anthropic SDK differs again — so this tolerates
 * all three rather than assuming one.
 */
const readHeader = (err: unknown, name: string): string | undefined => {
  const headers = (err as { headers?: unknown })?.headers;
  if (!headers) return undefined;

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record[name] ?? record[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
};

/**
 * `Retry-After` is either delta-seconds or an HTTP date (RFC 9110). OpenRouter also sends
 * `X-RateLimit-Reset` as an epoch timestamp — in milliseconds, though a seconds-precision value
 * from another provider is indistinguishable by shape alone, so both are normalised by magnitude.
 */
const parseRetryAfterMs = (err: unknown): number | undefined => {
  const retryAfter = readHeader(err, 'retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const asDate = Date.parse(retryAfter);
    if (Number.isFinite(asDate)) {
      const delta = asDate - Date.now();
      if (delta > 0) return delta;
    }
  }

  const reset = Number(readHeader(err, 'x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    // Below ~10^11 the value is seconds-since-epoch, above it is milliseconds.
    const resetMs = reset < 1e11 ? reset * 1000 : reset;
    const delta = resetMs - Date.now();
    if (delta > 0) return delta;
  }

  return undefined;
};

const clampCooldown = (ms: number): number => {
  const max = config.llm.key_cooldown_max_seconds * 1000;
  return Math.max(1000, Math.min(ms, max));
};

/**
 * Decides failover policy for a provider error.
 *
 * The distinction that actually saves money is `permanent`: a 400 (malformed request, bad model id)
 * or 404 (model not served) fails identically on every key in the pool, so retrying it just buys
 * another billable round trip for the same error. Before this existed, every failure — including
 * those — burned a second key.
 */
export const classifyLlmError = (err: unknown): ClassifiedLlmError => {
  const status = (err as { status?: number })?.status;
  const defaultCooldown = config.llm.key_cooldown_default_seconds * 1000;

  if (status === 429) {
    return {
      kind: 'rate_limited',
      status,
      cooldownMs: clampCooldown(parseRetryAfterMs(err) ?? defaultCooldown),
      shouldFailover: true,
    };
  }

  // 402 is OpenRouter's "insufficient credits". The key is valid but useless until topped up, so
  // cool it down hard rather than rediscovering that on every request.
  if (status === 402) {
    return {
      kind: 'exhausted',
      status,
      cooldownMs: clampCooldown(config.llm.key_cooldown_max_seconds * 1000),
      shouldFailover: true,
    };
  }

  // Revoked, disabled, or mistyped key. Another key can still serve the request.
  if (status === 401 || status === 403) {
    return {
      kind: 'bad_key',
      status,
      cooldownMs: clampCooldown(config.llm.key_cooldown_max_seconds * 1000),
      shouldFailover: true,
    };
  }

  if (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    (typeof status === 'number' && status >= 500)
  ) {
    // The provider is struggling, not the key — fail over without penalising the key.
    return { kind: 'transient', status, cooldownMs: 0, shouldFailover: true };
  }

  if (typeof status === 'number' && status >= 400) {
    return { kind: 'permanent', status, cooldownMs: 0, shouldFailover: false };
  }

  // No status at all: connection reset, DNS failure, SDK timeout, or a non-HTTP error thrown by
  // the adapter itself (e.g. "returned no message content"). Treat as transient — another key
  // often sits behind a different edge — but never blame the key.
  return { kind: 'transient', cooldownMs: 0, shouldFailover: true };
};
