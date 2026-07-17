"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInOAuthService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = __importDefault(require("../../config"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const crypto_2 = require("../../lib/crypto");
const logger_1 = require("../../lib/logger");
const redis_1 = require("../../lib/redis");
const httpStatus_1 = require("../../utils/httpStatus");
const analytics_service_1 = require("../Analytics/analytics.service");
const analytics_model_1 = require("../Analytics/analytics.model");
const platformCatalog_model_1 = require("../PlatformCatalog/platformCatalog.model");
const platformCredential_model_1 = require("../PlatformCredential/platformCredential.model");
const linkedinOAuth_api_1 = require("./linkedinOAuth.api");
/**
 * Scopes we request. Both belong to the **Community Management API** product — the app must have it
 * approved or LinkedIn rejects the authorize call with `unauthorized_scope_error`.
 *   - r_organization_admin  → list the organizations the member administers
 *   - r_organization_social → read the organization's posts + share statistics
 */
const REQUESTED_SCOPES = ['r_organization_admin', 'r_organization_social'];
const STATE_TTL_SECONDS = 10 * 60;
const PENDING_TTL_SECONDS = 15 * 60;
const stateKey = (state) => `oauth:li:${state}`;
const pendingKey = (teamId) => `oauth:li:pending:${teamId}`;
// Mirror MetaOAuth's defensive URL normalization — trailing slashes silently break LinkedIn's exact
// redirect_uri match and produce double-slash callback URLs.
const stripTrailingSlash = (u) => u.replace(/\/+$/, '');
const redirectUri = () => `${stripTrailingSlash(config_1.default.oauth_redirect_base_url)}/oauth/linkedin/callback`;
const webUrl = () => { var _a; return stripTrailingSlash((_a = config_1.default.web_url) !== null && _a !== void 0 ? _a : 'http://localhost:5173'); };
const frontendPlatformsPath = () => `${webUrl()}/dashboard/settings/platforms`;
const requireLinkedInConfigured = () => {
    const { clientId, clientSecret } = config_1.default.platforms.linkedin;
    if (!clientId || !clientSecret) {
        throw new AppError_1.default(httpStatus_1.httpStatus.INTERNAL_SERVER_ERROR, 'LinkedIn app is not configured — set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET');
    }
};
/** Step 1 — build the consent URL and stash CSRF state (carrying team context) in Redis. */
const buildConnectUrl = (teamId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    requireLinkedInConfigured();
    const state = crypto_1.default.randomBytes(32).toString('hex');
    yield redis_1.redis.set(stateKey(state), JSON.stringify({ teamId, userId }), 'EX', STATE_TTL_SECONDS);
    if (config_1.default.node_env !== 'production') {
        logger_1.logger.info(`[LinkedInOAuth] Register this EXACT redirect URI on the LinkedIn app → ${redirectUri()}`);
    }
    return (0, linkedinOAuth_api_1.buildAuthorizeUrl)({ redirectUri: redirectUri(), state, scopes: REQUESTED_SCOPES });
});
/** The organizations the member administers (APPROVED admin ACLs only). */
const listAdministeredOrgs = (token) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const projection = '(elements*(organizationalTarget~(id,localizedName,vanityName)))';
    const data = yield (0, linkedinOAuth_api_1.linkedinGet)(`v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=${encodeURIComponent(projection)}`, token);
    return ((_a = data.elements) !== null && _a !== void 0 ? _a : [])
        .map((el) => {
        var _a, _b, _c;
        const urn = (_a = el.organizationalTarget) !== null && _a !== void 0 ? _a : '';
        const id = (_b = urn.split(':').pop()) !== null && _b !== void 0 ? _b : '';
        const decorated = el['organizationalTarget~'];
        return { id, name: (_c = decorated === null || decorated === void 0 ? void 0 : decorated.localizedName) !== null && _c !== void 0 ? _c : `Organization ${id}`, vanity_name: decorated === null || decorated === void 0 ? void 0 : decorated.vanityName };
    })
        .filter((o) => o.id);
});
/**
 * Step 3 — callback handler. Returns a fully-qualified frontend redirect URL (success or a
 * `?error=` variant). Never throws for expected failure modes — the browser must land somewhere.
 */
const handleCallback = (query) => __awaiter(void 0, void 0, void 0, function* () {
    if (query.error) {
        // LinkedIn sends `unauthorized_scope_error` when the app lacks the Community Management product.
        const code = query.error === 'unauthorized_scope_error' ? 'missing_product' : 'access_denied';
        return `${frontendPlatformsPath()}?error=${code}`;
    }
    if (!query.code || !query.state) {
        return `${frontendPlatformsPath()}?error=invalid_request`;
    }
    const raw = yield redis_1.redis.get(stateKey(query.state));
    yield redis_1.redis.del(stateKey(query.state));
    if (!raw) {
        return `${frontendPlatformsPath()}?error=invalid_state`;
    }
    const { teamId } = JSON.parse(raw);
    try {
        const tokenRes = yield (0, linkedinOAuth_api_1.exchangeCodeForToken)(query.code, redirectUri());
        const grantedScopes = tokenRes.scope ? tokenRes.scope.split(/[ ,]+/).filter(Boolean) : REQUESTED_SCOPES;
        const expiresAt = new Date(Date.now() + tokenRes.expires_in * 1000).toISOString();
        const orgs = yield listAdministeredOrgs(tokenRes.access_token);
        if (orgs.length === 0) {
            return `${frontendPlatformsPath()}?error=no_orgs`;
        }
        const encryptedToken = (0, crypto_2.encrypt)(tokenRes.access_token);
        const candidates = orgs.map((o) => ({
            id: o.id,
            name: o.name,
            vanity_name: o.vanity_name,
            encrypted_token: encryptedToken,
            token_expires_at: expiresAt,
            scopes: grantedScopes,
        }));
        yield redis_1.redis.set(pendingKey(teamId), JSON.stringify(candidates), 'EX', PENDING_TTL_SECONDS);
        return `${frontendPlatformsPath()}?li=pick`;
    }
    catch (err) {
        if (err instanceof linkedinOAuth_api_1.LinkedInApiError && err.isForbidden) {
            return `${frontendPlatformsPath()}?error=missing_product`;
        }
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[LinkedInOAuth] Callback failed');
        return `${frontendPlatformsPath()}?error=connect_failed`;
    }
});
/** Step 4a — the pending candidate list, stripped of tokens, for the org-picker UI. */
const listPendingOrgs = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const raw = yield redis_1.redis.get(pendingKey(teamId));
    if (!raw)
        return [];
    const candidates = JSON.parse(raw);
    return candidates.map((c) => ({ id: c.id, name: c.name, vanity_name: c.vanity_name }));
});
const ensurePlatformEnabled = (teamId, platform, enabledBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield platformCatalog_model_1.PlatformCatalog.findOneAndUpdate({ name: platform }, { $setOnInsert: { name: platform, is_enabled: true, created_by: enabledBy }, $set: { updated_at: new Date() } }, { upsert: true, new: true });
    yield platformCatalog_model_1.TeamPlatform.findOneAndUpdate({ team_id: teamId, platform }, { team_id: teamId, platform, is_enabled: true, enabled_by: enabledBy, updated_at: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true });
});
/** Step 4b — persist the chosen organization, enable the platform, and kick an immediate refresh. */
const selectOrg = (teamId, userId, orgId) => __awaiter(void 0, void 0, void 0, function* () {
    const raw = yield redis_1.redis.get(pendingKey(teamId));
    if (!raw) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'No pending LinkedIn connection — start the connect flow again');
    }
    const candidates = JSON.parse(raw);
    const chosen = candidates.find((c) => c.id === orgId);
    if (!chosen) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'Selected organization is not among the pending candidates');
    }
    const token = (0, crypto_2.decrypt)(chosen.encrypted_token);
    yield ensurePlatformEnabled(teamId, 'linkedin', userId);
    yield platformCredential_model_1.PlatformCredential.findOneAndUpdate({ team_id: teamId, platform: 'linkedin' }, {
        team_id: teamId,
        platform: 'linkedin',
        encrypted_token: (0, crypto_2.encrypt)(token),
        token_last4: token.slice(-4),
        account_id: orgId,
        added_by: userId,
        token_type: 'user',
        token_expires_at: new Date(chosen.token_expires_at),
        scopes: chosen.scopes,
        external_name: chosen.name,
        connected_by: userId,
        updated_at: new Date(),
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    yield redis_1.redis.del(pendingKey(teamId));
    // Immediate one-team refresh so the dashboard has data within seconds, not 6 hours.
    (0, analytics_service_1.runAnalyticsRefresh)({ teamId }).catch((err) => logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[LinkedInOAuth] Immediate refresh after connect failed'));
    return { organization: chosen.name };
});
const upsertNotConnectedRollup = (teamId, platform) => __awaiter(void 0, void 0, void 0, function* () {
    yield analytics_model_1.AnalyticsRollup.findOneAndUpdate({ team_id: teamId, platform }, {
        team_id: teamId,
        platform,
        status: 'not_connected',
        period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
        overview: { reach: 0, engagements: 0, views: 0, engagement_rate: 0 },
        top_posts: [],
        best_times: [],
        content_breakdown: [],
        fetched_at: new Date(),
    }, { upsert: true, new: true });
});
/** Disconnect — delete the credential row and reset the rollup to not_connected. */
const disconnect = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    yield platformCredential_model_1.PlatformCredential.deleteMany({ team_id: teamId, platform: 'linkedin' });
    yield upsertNotConnectedRollup(teamId, 'linkedin');
});
exports.LinkedInOAuthService = {
    buildConnectUrl,
    handleCallback,
    listPendingOrgs,
    selectOrg,
    disconnect,
};
