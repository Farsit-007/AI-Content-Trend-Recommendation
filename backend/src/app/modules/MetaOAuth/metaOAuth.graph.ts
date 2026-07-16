import crypto from 'crypto';
import config from '../../config';
import { logger } from '../../lib/logger';

/**
 * Tiny typed wrapper around the Meta Graph API. Everything server-side goes through here so the
 * version pin, `appsecret_proof`, error-envelope parsing, and rate-limit header handling live in
 * exactly one place.
 *
 * Graph error envelope: `{ error: { message, type, code, error_subcode } }`.
 */

const GRAPH_BASE = () => `https://graph.facebook.com/${config.analytics.graph_api_version}`;

/** Meta's app-usage abort threshold — at/over this we stop making calls (taxonomy code-4 path). */
const USAGE_ABORT_THRESHOLD = 90;
const USAGE_WARN_THRESHOLD = 75;

export class GraphApiError extends Error {
  /** Graph top-level error code (e.g. 190 = token dead, 4 = app rate limit). */
  public readonly code: number;
  public readonly subcode?: number;
  public readonly type?: string;
  public readonly httpStatus: number;

  constructor(args: { code: number; subcode?: number; type?: string; message: string; httpStatus: number }) {
    super(args.message);
    this.name = 'GraphApiError';
    this.code = args.code;
    this.subcode = args.subcode;
    this.type = args.type;
    this.httpStatus = args.httpStatus;
  }
}

/**
 * `appsecret_proof` = HMAC-SHA256(access_token) keyed by the app secret. Sent on every
 * server-side call; combined with "Require App Secret" on the app it makes a stolen token
 * useless off our server.
 */
export const appSecretProof = (token: string): string => {
  const secret = config.platforms.facebook.clientSecret;
  if (!secret) throw new Error('FB_CLIENT_SECRET is not configured — cannot sign Graph calls');
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
};

/**
 * Reads `X-App-Usage` / `X-Business-Use-Case-Usage` and returns the peak utilization percent seen.
 * Logs a warning at >75%. The caller decides what to do at the abort threshold.
 */
const readUsage = (headers: Headers): number => {
  let peak = 0;

  const scan = (raw: string | null) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const collect = (obj: Record<string, unknown>) => {
        for (const v of Object.values(obj)) {
          if (typeof v === 'number') peak = Math.max(peak, v);
        }
      };
      // X-App-Usage is a flat object; X-Business-Use-Case-Usage is keyed by business id → array.
      if (Array.isArray(parsed)) {
        for (const entry of parsed) collect(entry as Record<string, unknown>);
      } else {
        for (const v of Object.values(parsed)) {
          if (typeof v === 'number') peak = Math.max(peak, v);
          else if (Array.isArray(v)) for (const e of v) collect(e as Record<string, unknown>);
          else if (v && typeof v === 'object') collect(v as Record<string, unknown>);
        }
      }
    } catch {
      // Malformed usage header — ignore, it must never break a successful data call.
    }
  };

  scan(headers.get('x-app-usage'));
  scan(headers.get('x-business-use-case-usage'));

  if (peak >= USAGE_WARN_THRESHOLD) {
    logger.warn({ usagePercent: peak }, '[MetaGraph] Graph API rate-limit utilization high');
  }
  return peak;
};

const buildQuery = (params: Record<string, string | number | undefined>, token: string): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) search.set(k, String(v));
  }
  search.set('access_token', token);
  search.set('appsecret_proof', appSecretProof(token));
  return search.toString();
};

const throwFromEnvelope = (body: unknown, httpStatus: number): never => {
  const err = (body as { error?: { code?: number; error_subcode?: number; type?: string; message?: string } })?.error;
  throw new GraphApiError({
    code: err?.code ?? 0,
    subcode: err?.error_subcode,
    type: err?.type,
    message: err?.message ?? `Graph API error (HTTP ${httpStatus})`,
    httpStatus,
  });
};

/** GET a Graph edge. `path` is version-relative, e.g. `me/accounts` or `{page-id}/published_posts`. */
export const graphGet = async <T = unknown>(
  path: string,
  params: Record<string, string | number | undefined>,
  token: string,
): Promise<T> => {
  const url = `${GRAPH_BASE()}/${path.replace(/^\//, '')}?${buildQuery(params, token)}`;
  const res = await fetch(url);

  const usage = readUsage(res.headers);
  if (usage >= USAGE_ABORT_THRESHOLD) {
    // Surface as a code-4 (app-level rate limit) so the refresh taxonomy aborts the run.
    throw new GraphApiError({
      code: 4,
      type: 'OAuthException',
      message: `App-usage at ${usage}% — aborting to stay under Meta rate limits`,
      httpStatus: res.status,
    });
  }

  const body = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok || (body as { error?: unknown }).error) {
    throwFromEnvelope(body, res.status);
  }
  return body as T;
};

/**
 * Batched GET via `POST /` with a `batch=[...]` array (≤50 sub-requests). Used for per-media IG
 * insights so 25 media = 1 HTTP call. Returns the parsed body of each sub-response in order;
 * a sub-request that itself errored yields `{ error }` which the caller tolerates per-item.
 */
export const graphBatch = async <T = unknown>(
  relativeUrls: string[],
  token: string,
): Promise<(T | { error: { code: number; message: string } })[]> => {
  const batch = relativeUrls.map((relative_url) => ({ method: 'GET', relative_url }));
  const search = new URLSearchParams();
  search.set('access_token', token);
  search.set('appsecret_proof', appSecretProof(token));
  search.set('batch', JSON.stringify(batch));

  const res = await fetch(`${GRAPH_BASE()}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: search.toString(),
  });

  const usage = readUsage(res.headers);
  if (usage >= USAGE_ABORT_THRESHOLD) {
    throw new GraphApiError({
      code: 4,
      type: 'OAuthException',
      message: `App-usage at ${usage}% — aborting to stay under Meta rate limits`,
      httpStatus: res.status,
    });
  }

  const body = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok || (body as { error?: unknown }).error) {
    throwFromEnvelope(body, res.status);
  }

  // Each element: { code, body } where body is a JSON string, or null if the sub-request timed out.
  return (body as { code: number; body: string | null }[]).map((sub) => {
    if (!sub || sub.body === null) return { error: { code: 0, message: 'Empty batch sub-response' } };
    try {
      return JSON.parse(sub.body) as T;
    } catch {
      return { error: { code: 0, message: 'Unparseable batch sub-response' } };
    }
  });
};

/** True when a Graph error means the stored token is dead and the user must reconnect. */
export const isTokenDeadError = (err: unknown): boolean =>
  err instanceof GraphApiError && err.code === 190;
