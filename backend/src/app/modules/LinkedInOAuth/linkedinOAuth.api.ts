import config from '../../config';
import { logger } from '../../lib/logger';

/**
 * Tiny typed wrapper around LinkedIn's OAuth + REST APIs — the LinkedIn analogue of
 * `MetaOAuth/metaOAuth.graph.ts`. Everything server-side goes through here so the API version pin,
 * the required `X-Restli-Protocol-Version` / `LinkedIn-Version` headers, and error-envelope parsing
 * live in exactly one place.
 *
 * NOTE: The organization endpoints (admin-org list, posts, share statistics) require the
 * **Community Management API** product to be approved on the LinkedIn app. Until then LinkedIn
 * returns HTTP 403 — callers surface that as `pending_approval`, never a crash.
 */

const OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const API_BASE = 'https://api.linkedin.com';

/**
 * LinkedIn versions its REST API monthly (YYYYMM) and expires versions after ~12 months. Bump this
 * to a recent month if calls start returning "invalid version". Only affects `/rest/*` endpoints.
 */
export const LINKEDIN_API_VERSION = '202506';

export class LinkedInApiError extends Error {
  public readonly httpStatus: number;
  public readonly serviceErrorCode?: number;

  constructor(args: { message: string; httpStatus: number; serviceErrorCode?: number }) {
    super(args.message);
    this.name = 'LinkedInApiError';
    this.httpStatus = args.httpStatus;
    this.serviceErrorCode = args.serviceErrorCode;
  }

  /** True when the app simply lacks the product/permission (403) — the caller degrades gracefully. */
  get isForbidden(): boolean {
    return this.httpStatus === 403;
  }

  /** True when the stored token is dead/expired (401) — the team must reconnect. */
  get isUnauthorized(): boolean {
    return this.httpStatus === 401;
  }
}

const requireLinkedInAppConfig = (): { clientId: string; clientSecret: string } => {
  const { clientId, clientSecret } = config.platforms.linkedin;
  if (!clientId || !clientSecret) {
    throw new Error('LinkedIn app is not configured — set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET');
  }
  return { clientId, clientSecret };
};

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number; // seconds — LinkedIn access tokens last ~60 days
  scope?: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

/** Build the consent URL. Scopes are space-separated per the OAuth 2.0 spec. */
export const buildAuthorizeUrl = (args: {
  redirectUri: string;
  state: string;
  scopes: string[];
}): string => {
  const { clientId } = requireLinkedInAppConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: args.scopes.join(' '),
  });
  return `${OAUTH_BASE}/authorization?${params.toString()}`;
};

/** Exchange an authorization code for an access token. */
export const exchangeCodeForToken = async (code: string, redirectUri: string): Promise<LinkedInTokenResponse> => {
  const { clientId, clientSecret } = requireLinkedInAppConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${OAUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const parsed = (await res.json().catch(() => ({}))) as LinkedInTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !parsed.access_token) {
    throw new LinkedInApiError({
      message: parsed.error_description ?? parsed.error ?? 'Failed to exchange code for LinkedIn token',
      httpStatus: res.status,
    });
  }
  return parsed;
};

const parseErrorEnvelope = async (res: Response): Promise<never> => {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    serviceErrorCode?: number;
    error?: string;
    error_description?: string;
  };
  throw new LinkedInApiError({
    message: body.message ?? body.error_description ?? body.error ?? `LinkedIn API error (HTTP ${res.status})`,
    httpStatus: res.status,
    serviceErrorCode: body.serviceErrorCode,
  });
};

/**
 * GET a LinkedIn REST/v2 edge. `path` is API-base-relative, e.g. `v2/organizationalEntityAcls?...`
 * or `rest/posts?...`. Sends the auth token plus the Restli + version headers LinkedIn requires.
 */
export const linkedinGet = async <T = unknown>(path: string, token: string): Promise<T> => {
  const url = `${API_BASE}/${path.replace(/^\//, '')}`;
  const isRest = path.replace(/^\//, '').startsWith('rest/');
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0',
      // /rest/* endpoints require a version header; /v2/* endpoints ignore it.
      ...(isRest ? { 'LinkedIn-Version': LINKEDIN_API_VERSION } : {}),
    },
  });

  if (!res.ok) {
    if (res.status >= 500) {
      logger.warn({ status: res.status, path }, '[LinkedIn] Upstream error');
    }
    await parseErrorEnvelope(res);
  }
  return (await res.json().catch(() => ({}))) as T;
};
