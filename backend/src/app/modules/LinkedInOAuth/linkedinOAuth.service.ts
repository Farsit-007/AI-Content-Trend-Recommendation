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
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  LinkedInApiError,
  linkedinGet,
} from './linkedinOAuth.api';

/**
 * Scopes we request. Both belong to the **Community Management API** product — the app must have it
 * approved or LinkedIn rejects the authorize call with `unauthorized_scope_error`.
 *   - r_organization_admin  → list the organizations the member administers
 *   - r_organization_social → read the organization's posts + share statistics
 */
const REQUESTED_SCOPES = ['r_organization_admin', 'r_organization_social'];

const STATE_TTL_SECONDS = 10 * 60;
const PENDING_TTL_SECONDS = 15 * 60;

const stateKey = (state: string) => `oauth:li:${state}`;
const pendingKey = (teamId: string) => `oauth:li:pending:${teamId}`;

// Mirror MetaOAuth's defensive URL normalization — trailing slashes silently break LinkedIn's exact
// redirect_uri match and produce double-slash callback URLs.
const stripTrailingSlash = (u: string) => u.replace(/\/+$/, '');
const redirectUri = () => `${stripTrailingSlash(config.oauth_redirect_base_url)}/oauth/linkedin/callback`;
const webUrl = () => stripTrailingSlash(config.web_url ?? 'http://localhost:5173');
const frontendPlatformsPath = () => `${webUrl()}/dashboard/settings/platforms`;

interface PendingOrg {
  id: string;
  name: string;
  vanity_name?: string;
  encrypted_token: string;
  token_expires_at: string; // ISO
  scopes: string[];
}

const requireLinkedInConfigured = (): void => {
  const { clientId, clientSecret } = config.platforms.linkedin;
  if (!clientId || !clientSecret) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'LinkedIn app is not configured — set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET',
    );
  }
};

/** Step 1 — build the consent URL and stash CSRF state (carrying team context) in Redis. */
const buildConnectUrl = async (teamId: string, userId: string): Promise<string> => {
  requireLinkedInConfigured();
  const state = crypto.randomBytes(32).toString('hex');
  await redis.set(stateKey(state), JSON.stringify({ teamId, userId }), 'EX', STATE_TTL_SECONDS);

  if (config.node_env !== 'production') {
    logger.info(`[LinkedInOAuth] Register this EXACT redirect URI on the LinkedIn app → ${redirectUri()}`);
  }

  return buildAuthorizeUrl({ redirectUri: redirectUri(), state, scopes: REQUESTED_SCOPES });
};

interface OrgAclResponse {
  elements?: {
    organizationalTarget?: string;
    'organizationalTarget~'?: { id?: number; localizedName?: string; vanityName?: string };
  }[];
}

/** The organizations the member administers (APPROVED admin ACLs only). */
const listAdministeredOrgs = async (
  token: string,
): Promise<{ id: string; name: string; vanity_name?: string }[]> => {
  const projection = '(elements*(organizationalTarget~(id,localizedName,vanityName)))';
  const data = await linkedinGet<OrgAclResponse>(
    `v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=${encodeURIComponent(projection)}`,
    token,
  );
  return (data.elements ?? [])
    .map((el) => {
      const urn = el.organizationalTarget ?? '';
      const id = urn.split(':').pop() ?? '';
      const decorated = el['organizationalTarget~'];
      return { id, name: decorated?.localizedName ?? `Organization ${id}`, vanity_name: decorated?.vanityName };
    })
    .filter((o) => o.id);
};

/**
 * Step 3 — callback handler. Returns a fully-qualified frontend redirect URL (success or a
 * `?error=` variant). Never throws for expected failure modes — the browser must land somewhere.
 */
const handleCallback = async (query: { code?: string; state?: string; error?: string }): Promise<string> => {
  if (query.error) {
    // LinkedIn sends `unauthorized_scope_error` when the app lacks the Community Management product.
    const code = query.error === 'unauthorized_scope_error' ? 'missing_product' : 'access_denied';
    return `${frontendPlatformsPath()}?error=${code}`;
  }
  if (!query.code || !query.state) {
    return `${frontendPlatformsPath()}?error=invalid_request`;
  }

  const raw = await redis.get(stateKey(query.state));
  await redis.del(stateKey(query.state));
  if (!raw) {
    return `${frontendPlatformsPath()}?error=invalid_state`;
  }
  const { teamId } = JSON.parse(raw) as { teamId: string; userId: string };

  try {
    const tokenRes = await exchangeCodeForToken(query.code, redirectUri());
    const grantedScopes = tokenRes.scope ? tokenRes.scope.split(/[ ,]+/).filter(Boolean) : REQUESTED_SCOPES;
    const expiresAt = new Date(Date.now() + tokenRes.expires_in * 1000).toISOString();

    const orgs = await listAdministeredOrgs(tokenRes.access_token);
    if (orgs.length === 0) {
      return `${frontendPlatformsPath()}?error=no_orgs`;
    }

    const encryptedToken = encrypt(tokenRes.access_token);
    const candidates: PendingOrg[] = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      vanity_name: o.vanity_name,
      encrypted_token: encryptedToken,
      token_expires_at: expiresAt,
      scopes: grantedScopes,
    }));

    await redis.set(pendingKey(teamId), JSON.stringify(candidates), 'EX', PENDING_TTL_SECONDS);
    return `${frontendPlatformsPath()}?li=pick`;
  } catch (err) {
    if (err instanceof LinkedInApiError && err.isForbidden) {
      return `${frontendPlatformsPath()}?error=missing_product`;
    }
    logger.error({ err: err instanceof Error ? err.message : err }, '[LinkedInOAuth] Callback failed');
    return `${frontendPlatformsPath()}?error=connect_failed`;
  }
};

/** Step 4a — the pending candidate list, stripped of tokens, for the org-picker UI. */
const listPendingOrgs = async (
  teamId: string,
): Promise<{ id: string; name: string; vanity_name?: string }[]> => {
  const raw = await redis.get(pendingKey(teamId));
  if (!raw) return [];
  const candidates = JSON.parse(raw) as PendingOrg[];
  return candidates.map((c) => ({ id: c.id, name: c.name, vanity_name: c.vanity_name }));
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

/** Step 4b — persist the chosen organization, enable the platform, and kick an immediate refresh. */
const selectOrg = async (
  teamId: string,
  userId: string,
  orgId: string,
): Promise<{ organization: string }> => {
  const raw = await redis.get(pendingKey(teamId));
  if (!raw) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No pending LinkedIn connection — start the connect flow again');
  }
  const candidates = JSON.parse(raw) as PendingOrg[];
  const chosen = candidates.find((c) => c.id === orgId);
  if (!chosen) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Selected organization is not among the pending candidates');
  }

  const token = decrypt(chosen.encrypted_token);

  await ensurePlatformEnabled(teamId, 'linkedin', userId);
  await PlatformCredential.findOneAndUpdate(
    { team_id: teamId, platform: 'linkedin' },
    {
      team_id: teamId,
      platform: 'linkedin',
      encrypted_token: encrypt(token),
      token_last4: token.slice(-4),
      account_id: orgId,
      added_by: userId,
      token_type: 'user',
      token_expires_at: new Date(chosen.token_expires_at),
      scopes: chosen.scopes,
      external_name: chosen.name,
      connected_by: userId,
      updated_at: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await redis.del(pendingKey(teamId));

  // Immediate one-team refresh so the dashboard has data within seconds, not 6 hours.
  runAnalyticsRefresh({ teamId }).catch((err) =>
    logger.error({ err: err instanceof Error ? err.message : err }, '[LinkedInOAuth] Immediate refresh after connect failed'),
  );

  return { organization: chosen.name };
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

/** Disconnect — delete the credential row and reset the rollup to not_connected. */
const disconnect = async (teamId: string): Promise<void> => {
  await PlatformCredential.deleteMany({ team_id: teamId, platform: 'linkedin' });
  await upsertNotConnectedRollup(teamId, 'linkedin');
};

export const LinkedInOAuthService = {
  buildConnectUrl,
  handleCallback,
  listPendingOrgs,
  selectOrg,
  disconnect,
};
