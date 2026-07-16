import crypto from 'crypto';
import config from '../../config';
import AppError from '../../errors/AppError';
import { decrypt, encrypt } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { httpStatus } from '../../utils/httpStatus';
import { runAnalyticsRefresh } from '../Analytics/analytics.service';
import { AnalyticsRollup } from '../Analytics/analytics.model';
import { PlatformCatalog, TeamPlatform } from '../PlatformCatalog/platformCatalog.model';
import { PlatformCredential } from '../PlatformCredential/platformCredential.model';
import { appSecretProof, graphGet } from './metaOAuth.graph';

/** Scopes we request. `public_profile` is auto-granted and not always echoed back in debug_token. */
const REQUESTED_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'read_insights',
  'instagram_basic',
  'instagram_manage_insights',
];

/** Scopes we actually require to function (public_profile excluded — it's implicit). */
const REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'read_insights',
];

const STATE_TTL_SECONDS = 10 * 60;
const PENDING_TTL_SECONDS = 15 * 60;

const GRAPH_BASE = () => `https://graph.facebook.com/${config.analytics.graph_api_version}`;
const stateKey = (state: string) => `oauth:fb:${state}`;
const pendingKey = (teamId: string) => `oauth:fb:pending:${teamId}`;

// Trailing slashes in env vars silently break redirects (double slashes) and Meta's exact
// redirect_uri match — normalize defensively so local dev "just works" regardless of how the
// URLs are written in .env.
const stripTrailingSlash = (u: string) => u.replace(/\/+$/, '');
const redirectUri = () => `${stripTrailingSlash(config.oauth_redirect_base_url)}/oauth/facebook/callback`;
const webUrl = () => stripTrailingSlash(config.web_url ?? 'http://localhost:5173');
const frontendPlatformsPath = () => `${webUrl()}/dashboard/settings/platforms`;

interface PendingPage {
  id: string;
  name: string;
  picture?: string;
  encrypted_page_token: string;
  ig_user_id?: string;
  ig_username?: string;
  scopes: string[];
}

const requireFacebookAppConfig = (): { clientId: string; clientSecret: string } => {
  const { clientId, clientSecret } = config.platforms.facebook;
  if (!clientId || !clientSecret) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Facebook app is not configured — set FB_CLIENT_ID and FB_CLIENT_SECRET',
    );
  }
  return { clientId, clientSecret };
};

/** Step 1 — build the consent URL and stash CSRF state (carrying team context) in Redis. */
const buildConnectUrl = async (teamId: string, userId: string): Promise<string> => {
  const { clientId } = requireFacebookAppConfig();
  const state = crypto.randomBytes(32).toString('hex');
  await redis.set(stateKey(state), JSON.stringify({ teamId, userId }), 'EX', STATE_TTL_SECONDS);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    state,
    response_type: 'code',
    scope: REQUESTED_SCOPES.join(','),
  });

  // Dev aid: `redirect_uri_mismatch` is the #1 Meta setup error. Log the exact URI we send so it
  // can be pasted verbatim into the app's "Valid OAuth Redirect URIs" allowlist.
  if (config.node_env !== 'production') {
    logger.info(
      `[MetaOAuth] Register this EXACT redirect URI on the Meta app → ${redirectUri()}`,
    );
  }

  return `https://www.facebook.com/${config.analytics.graph_api_version}/dialog/oauth?${params.toString()}`;
};

const exchangeCodeForToken = async (code: string): Promise<string> => {
  const { clientId, clientSecret } = requireFacebookAppConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !body.access_token) {
    throw new AppError(httpStatus.BAD_REQUEST, body.error?.message ?? 'Failed to exchange code for token');
  }
  return body.access_token;
};

const exchangeForLongLivedUserToken = async (shortLivedToken: string): Promise<string> => {
  const { clientId, clientSecret } = requireFacebookAppConfig();
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !body.access_token) {
    throw new AppError(httpStatus.BAD_REQUEST, body.error?.message ?? 'Failed to exchange for long-lived token');
  }
  return body.access_token;
};

/** debug_token — validates the token and returns its granted scopes and type. */
const debugToken = async (
  inputToken: string,
): Promise<{ isValid: boolean; scopes: string[]; type?: string; profileId?: string; expiresAt?: number }> => {
  const { clientId, clientSecret } = requireFacebookAppConfig();
  const params = new URLSearchParams({
    input_token: inputToken,
    access_token: `${clientId}|${clientSecret}`,
  });
  const res = await fetch(`${GRAPH_BASE()}/debug_token?${params.toString()}`);
  const body = (await res.json().catch(() => ({}))) as {
    data?: { is_valid?: boolean; scopes?: string[]; type?: string; profile_id?: string; expires_at?: number };
  };
  const d = body.data ?? {};
  return {
    isValid: Boolean(d.is_valid),
    scopes: d.scopes ?? [],
    type: d.type,
    profileId: d.profile_id,
    expiresAt: d.expires_at,
  };
};

interface MeAccount {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string };
}

const listAdministeredPages = async (userToken: string): Promise<MeAccount[]> => {
  const data = await graphGet<{ data?: MeAccount[] }>(
    'me/accounts',
    { fields: 'id,name,picture,access_token,instagram_business_account{id,username}' },
    userToken,
  );
  return data.data ?? [];
};

/**
 * Step 3 — callback handler. Returns a fully-qualified frontend redirect URL (success or a
 * `?error=` variant). Never throws for expected failure modes — the browser must land somewhere.
 */
const handleCallback = async (query: { code?: string; state?: string; error?: string }): Promise<string> => {
  if (query.error) {
    return `${frontendPlatformsPath()}?error=access_denied`;
  }
  if (!query.code || !query.state) {
    return `${frontendPlatformsPath()}?error=invalid_request`;
  }

  // CSRF + team context — single-use.
  const raw = await redis.get(stateKey(query.state));
  await redis.del(stateKey(query.state));
  if (!raw) {
    return `${frontendPlatformsPath()}?error=invalid_state`;
  }
  const { teamId } = JSON.parse(raw) as { teamId: string; userId: string };

  try {
    const shortLived = await exchangeCodeForToken(query.code);
    const longLived = await exchangeForLongLivedUserToken(shortLived);

    const debug = await debugToken(longLived);
    if (!debug.isValid) {
      return `${frontendPlatformsPath()}?error=invalid_token`;
    }
    const missing = REQUIRED_SCOPES.filter((s) => !debug.scopes.includes(s));
    if (missing.length > 0) {
      return `${frontendPlatformsPath()}?error=missing_permissions&missing=${missing.join(',')}`;
    }

    const pages = await listAdministeredPages(longLived);
    if (pages.length === 0) {
      return `${frontendPlatformsPath()}?error=no_pages`;
    }

    const candidates: PendingPage[] = pages.map((p) => ({
      id: p.id,
      name: p.name,
      picture: p.picture?.data?.url,
      encrypted_page_token: encrypt(p.access_token),
      ig_user_id: p.instagram_business_account?.id,
      ig_username: p.instagram_business_account?.username,
      scopes: debug.scopes,
    }));

    await redis.set(pendingKey(teamId), JSON.stringify(candidates), 'EX', PENDING_TTL_SECONDS);
    return `${frontendPlatformsPath()}?fb=pick`;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[MetaOAuth] Callback failed');
    return `${frontendPlatformsPath()}?error=connect_failed`;
  }
};

/** Step 4a — the pending candidate list, stripped of tokens, for the page-picker UI. */
const listPendingPages = async (
  teamId: string,
): Promise<{ id: string; name: string; picture?: string; ig_linked: boolean; ig_username?: string }[]> => {
  const raw = await redis.get(pendingKey(teamId));
  if (!raw) return [];
  const candidates = JSON.parse(raw) as PendingPage[];
  return candidates.map((c) => ({
    id: c.id,
    name: c.name,
    picture: c.picture,
    ig_linked: Boolean(c.ig_user_id),
    ig_username: c.ig_username,
  }));
};

const ensurePlatformEnabled = async (teamId: string, platform: string, enabledBy: string): Promise<void> => {
  await PlatformCatalog.findOneAndUpdate(
    { name: platform },
    { $setOnInsert: { name: platform, is_enabled: true, created_by: enabledBy }, $set: { updated_at: new Date() } },
    { upsert: true, new: true },
  );
  await TeamPlatform.findOneAndUpdate(
    { team_id: teamId, platform },
    { team_id: teamId, platform, is_enabled: true, enabled_by: enabledBy, updated_at: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

const upsertOAuthCredential = async (args: {
  teamId: string;
  platform: string;
  plainToken: string;
  accountId: string;
  pageId: string;
  externalName?: string;
  scopes: string[];
  connectedBy: string;
}): Promise<void> => {
  await PlatformCredential.findOneAndUpdate(
    { team_id: args.teamId, platform: args.platform },
    {
      team_id: args.teamId,
      platform: args.platform,
      encrypted_token: encrypt(args.plainToken),
      token_last4: args.plainToken.slice(-4),
      account_id: args.accountId,
      added_by: args.connectedBy,
      token_type: 'page',
      token_expires_at: null,
      scopes: args.scopes,
      page_id: args.pageId,
      external_name: args.externalName,
      connected_by: args.connectedBy,
      updated_at: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

/** Step 4b — persist the chosen page (+ linked IG), enable platforms, and kick an immediate refresh. */
const selectPage = async (
  teamId: string,
  userId: string,
  pageId: string,
): Promise<{ page: string; instagram: boolean }> => {
  const raw = await redis.get(pendingKey(teamId));
  if (!raw) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No pending Facebook connection — start the connect flow again');
  }
  const candidates = JSON.parse(raw) as PendingPage[];
  const chosen = candidates.find((c) => c.id === pageId);
  if (!chosen) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Selected page is not among the pending candidates');
  }

  // Decrypt the page token only to re-validate + re-store it against this platform row.
  const pageToken = decrypt(chosen.encrypted_page_token);

  const debug = await debugToken(pageToken);
  if (!debug.isValid || (debug.type && debug.type.toUpperCase() !== 'PAGE') || (debug.profileId && debug.profileId !== pageId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Page token failed validation');
  }

  await ensurePlatformEnabled(teamId, 'facebook', userId);
  await upsertOAuthCredential({
    teamId,
    platform: 'facebook',
    plainToken: pageToken,
    accountId: pageId,
    pageId,
    externalName: chosen.name,
    scopes: chosen.scopes,
    connectedBy: userId,
  });

  const hasInstagram = Boolean(chosen.ig_user_id);
  if (hasInstagram && chosen.ig_user_id) {
    await ensurePlatformEnabled(teamId, 'instagram', userId);
    await upsertOAuthCredential({
      teamId,
      platform: 'instagram',
      plainToken: pageToken, // same Page token authorizes IG insights
      accountId: chosen.ig_user_id,
      pageId,
      externalName: chosen.ig_username,
      scopes: chosen.scopes,
      connectedBy: userId,
    });
  }

  await redis.del(pendingKey(teamId));

  // Immediate one-team refresh so the dashboard has data within seconds, not 6 hours.
  runAnalyticsRefresh({ teamId }).catch((err) =>
    logger.error({ err: err instanceof Error ? err.message : err }, '[MetaOAuth] Immediate refresh after connect failed'),
  );

  return { page: chosen.name, instagram: hasInstagram };
};

const upsertNotConnectedRollup = async (teamId: string, platform: string): Promise<void> => {
  await AnalyticsRollup.findOneAndUpdate(
    { team_id: teamId, platform },
    {
      team_id: teamId,
      platform,
      status: 'not_connected',
      period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
      overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
      top_posts: [],
      best_times: [],
      content_breakdown: [],
      fetched_at: new Date(),
    },
    { upsert: true, new: true },
  );
};

/** Disconnect — revoke on Meta's side, delete both credential rows, reset rollups to not_connected. */
const disconnect = async (teamId: string): Promise<void> => {
  const fbCred = await PlatformCredential.findOne({ team_id: teamId, platform: 'facebook' }).select('+encrypted_token');
  if (fbCred?.encrypted_token && fbCred.page_id) {
    try {
      const pageToken = decrypt(fbCred.encrypted_token);
      const params = new URLSearchParams({ access_token: pageToken, appsecret_proof: appSecretProof(pageToken) });
      await fetch(`${GRAPH_BASE()}/${fbCred.page_id}/permissions?${params.toString()}`, { method: 'DELETE' });
    } catch (err) {
      // Best-effort revocation — never block local cleanup if Meta's call fails.
      logger.warn({ err: err instanceof Error ? err.message : err }, '[MetaOAuth] Meta-side revoke failed; continuing');
    }
  }

  await PlatformCredential.deleteMany({ team_id: teamId, platform: { $in: ['facebook', 'instagram'] } });
  await upsertNotConnectedRollup(teamId, 'facebook');
  await upsertNotConnectedRollup(teamId, 'instagram');
};

/** Meta data-deletion callback — verify the signed_request, purge that Meta user's credentials. */
const handleDataDeletion = async (signedRequest: string): Promise<{ url: string; confirmation_code: string }> => {
  const { clientSecret } = requireFacebookAppConfig();
  const [encodedSig, payload] = (signedRequest ?? '').split('.');
  if (!encodedSig || !payload) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Malformed signed_request');
  }

  const base64UrlDecode = (input: string): Buffer =>
    Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  const expectedSig = crypto.createHmac('sha256', clientSecret).update(payload).digest();
  const actualSig = base64UrlDecode(encodedSig);
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid signed_request signature');
  }

  const data = JSON.parse(base64UrlDecode(payload).toString('utf8')) as { user_id?: string };
  const confirmation_code = crypto.randomBytes(8).toString('hex');

  if (data.user_id) {
    await PlatformCredential.deleteMany({ connected_by: data.user_id });
  }

  return { url: `${webUrl()}/data-deletion?code=${confirmation_code}`, confirmation_code };
};

export const MetaOAuthService = {
  buildConnectUrl,
  handleCallback,
  listPendingPages,
  selectPage,
  disconnect,
  handleDataDeletion,
};
