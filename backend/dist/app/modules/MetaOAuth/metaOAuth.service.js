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
exports.MetaOAuthService = void 0;
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
const metaOAuth_graph_1 = require("./metaOAuth.graph");
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
const GRAPH_BASE = () => `https://graph.facebook.com/${config_1.default.analytics.graph_api_version}`;
const stateKey = (state) => `oauth:fb:${state}`;
const pendingKey = (teamId) => `oauth:fb:pending:${teamId}`;
// Trailing slashes in env vars silently break redirects (double slashes) and Meta's exact
// redirect_uri match — normalize defensively so local dev "just works" regardless of how the
// URLs are written in .env.
const stripTrailingSlash = (u) => u.replace(/\/+$/, '');
const redirectUri = () => `${stripTrailingSlash(config_1.default.oauth_redirect_base_url)}/oauth/facebook/callback`;
const webUrl = () => { var _a; return stripTrailingSlash((_a = config_1.default.web_url) !== null && _a !== void 0 ? _a : 'http://localhost:5173'); };
const frontendPlatformsPath = () => `${webUrl()}/dashboard/settings/platforms`;
const requireFacebookAppConfig = () => {
    const { clientId, clientSecret } = config_1.default.platforms.facebook;
    if (!clientId || !clientSecret) {
        throw new AppError_1.default(httpStatus_1.httpStatus.INTERNAL_SERVER_ERROR, 'Facebook app is not configured — set FB_CLIENT_ID and FB_CLIENT_SECRET');
    }
    return { clientId, clientSecret };
};
/** Step 1 — build the consent URL and stash CSRF state (carrying team context) in Redis. */
const buildConnectUrl = (teamId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientId } = requireFacebookAppConfig();
    const state = crypto_1.default.randomBytes(32).toString('hex');
    yield redis_1.redis.set(stateKey(state), JSON.stringify({ teamId, userId }), 'EX', STATE_TTL_SECONDS);
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri(),
        state,
        response_type: 'code',
        scope: REQUESTED_SCOPES.join(','),
    });
    // Dev aid: `redirect_uri_mismatch` is the #1 Meta setup error. Log the exact URI we send so it
    // can be pasted verbatim into the app's "Valid OAuth Redirect URIs" allowlist.
    if (config_1.default.node_env !== 'production') {
        logger_1.logger.info(`[MetaOAuth] Register this EXACT redirect URI on the Meta app → ${redirectUri()}`);
    }
    return `https://www.facebook.com/${config_1.default.analytics.graph_api_version}/dialog/oauth?${params.toString()}`;
});
const exchangeCodeForToken = (code) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { clientId, clientSecret } = requireFacebookAppConfig();
    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(),
        code,
    });
    const res = yield fetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
    const body = (yield res.json().catch(() => ({})));
    if (!res.ok || !body.access_token) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, (_b = (_a = body.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : 'Failed to exchange code for token');
    }
    return body.access_token;
});
const exchangeForLongLivedUserToken = (shortLivedToken) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { clientId, clientSecret } = requireFacebookAppConfig();
    const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: shortLivedToken,
    });
    const res = yield fetch(`${GRAPH_BASE()}/oauth/access_token?${params.toString()}`);
    const body = (yield res.json().catch(() => ({})));
    if (!res.ok || !body.access_token) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, (_b = (_a = body.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : 'Failed to exchange for long-lived token');
    }
    return body.access_token;
});
/** debug_token — validates the token and returns its granted scopes and type. */
const debugToken = (inputToken) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { clientId, clientSecret } = requireFacebookAppConfig();
    const params = new URLSearchParams({
        input_token: inputToken,
        access_token: `${clientId}|${clientSecret}`,
    });
    const res = yield fetch(`${GRAPH_BASE()}/debug_token?${params.toString()}`);
    const body = (yield res.json().catch(() => ({})));
    const d = (_a = body.data) !== null && _a !== void 0 ? _a : {};
    return {
        isValid: Boolean(d.is_valid),
        scopes: (_b = d.scopes) !== null && _b !== void 0 ? _b : [],
        type: d.type,
        profileId: d.profile_id,
        expiresAt: d.expires_at,
    };
});
const listAdministeredPages = (userToken) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const data = yield (0, metaOAuth_graph_1.graphGet)('me/accounts', { fields: 'id,name,picture,access_token,instagram_business_account{id,username}' }, userToken);
    return (_a = data.data) !== null && _a !== void 0 ? _a : [];
});
/**
 * Step 3 — callback handler. Returns a fully-qualified frontend redirect URL (success or a
 * `?error=` variant). Never throws for expected failure modes — the browser must land somewhere.
 */
const handleCallback = (query) => __awaiter(void 0, void 0, void 0, function* () {
    if (query.error) {
        return `${frontendPlatformsPath()}?error=access_denied`;
    }
    if (!query.code || !query.state) {
        return `${frontendPlatformsPath()}?error=invalid_request`;
    }
    // CSRF + team context — single-use.
    const raw = yield redis_1.redis.get(stateKey(query.state));
    yield redis_1.redis.del(stateKey(query.state));
    if (!raw) {
        return `${frontendPlatformsPath()}?error=invalid_state`;
    }
    const { teamId } = JSON.parse(raw);
    try {
        const shortLived = yield exchangeCodeForToken(query.code);
        const longLived = yield exchangeForLongLivedUserToken(shortLived);
        const debug = yield debugToken(longLived);
        if (!debug.isValid) {
            return `${frontendPlatformsPath()}?error=invalid_token`;
        }
        const missing = REQUIRED_SCOPES.filter((s) => !debug.scopes.includes(s));
        if (missing.length > 0) {
            return `${frontendPlatformsPath()}?error=missing_permissions&missing=${missing.join(',')}`;
        }
        const pages = yield listAdministeredPages(longLived);
        if (pages.length === 0) {
            return `${frontendPlatformsPath()}?error=no_pages`;
        }
        const candidates = pages.map((p) => {
            var _a, _b, _c, _d;
            return ({
                id: p.id,
                name: p.name,
                picture: (_b = (_a = p.picture) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.url,
                encrypted_page_token: (0, crypto_2.encrypt)(p.access_token),
                ig_user_id: (_c = p.instagram_business_account) === null || _c === void 0 ? void 0 : _c.id,
                ig_username: (_d = p.instagram_business_account) === null || _d === void 0 ? void 0 : _d.username,
                scopes: debug.scopes,
            });
        });
        yield redis_1.redis.set(pendingKey(teamId), JSON.stringify(candidates), 'EX', PENDING_TTL_SECONDS);
        return `${frontendPlatformsPath()}?fb=pick`;
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[MetaOAuth] Callback failed');
        return `${frontendPlatformsPath()}?error=connect_failed`;
    }
});
/** Step 4a — the pending candidate list, stripped of tokens, for the page-picker UI. */
const listPendingPages = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const raw = yield redis_1.redis.get(pendingKey(teamId));
    if (!raw)
        return [];
    const candidates = JSON.parse(raw);
    return candidates.map((c) => ({
        id: c.id,
        name: c.name,
        picture: c.picture,
        ig_linked: Boolean(c.ig_user_id),
        ig_username: c.ig_username,
    }));
});
const ensurePlatformEnabled = (teamId, platform, enabledBy) => __awaiter(void 0, void 0, void 0, function* () {
    yield platformCatalog_model_1.PlatformCatalog.findOneAndUpdate({ name: platform }, { $setOnInsert: { name: platform, is_enabled: true, created_by: enabledBy }, $set: { updated_at: new Date() } }, { upsert: true, new: true });
    yield platformCatalog_model_1.TeamPlatform.findOneAndUpdate({ team_id: teamId, platform }, { team_id: teamId, platform, is_enabled: true, enabled_by: enabledBy, updated_at: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true });
});
const upsertOAuthCredential = (args) => __awaiter(void 0, void 0, void 0, function* () {
    yield platformCredential_model_1.PlatformCredential.findOneAndUpdate({ team_id: args.teamId, platform: args.platform }, {
        team_id: args.teamId,
        platform: args.platform,
        encrypted_token: (0, crypto_2.encrypt)(args.plainToken),
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
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
});
/** Step 4b — persist the chosen page (+ linked IG), enable platforms, and kick an immediate refresh. */
const selectPage = (teamId, userId, pageId) => __awaiter(void 0, void 0, void 0, function* () {
    const raw = yield redis_1.redis.get(pendingKey(teamId));
    if (!raw) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'No pending Facebook connection — start the connect flow again');
    }
    const candidates = JSON.parse(raw);
    const chosen = candidates.find((c) => c.id === pageId);
    if (!chosen) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'Selected page is not among the pending candidates');
    }
    // Decrypt the page token only to re-validate + re-store it against this platform row.
    const pageToken = (0, crypto_2.decrypt)(chosen.encrypted_page_token);
    const debug = yield debugToken(pageToken);
    if (!debug.isValid || (debug.type && debug.type.toUpperCase() !== 'PAGE') || (debug.profileId && debug.profileId !== pageId)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'Page token failed validation');
    }
    yield ensurePlatformEnabled(teamId, 'facebook', userId);
    yield upsertOAuthCredential({
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
        yield ensurePlatformEnabled(teamId, 'instagram', userId);
        yield upsertOAuthCredential({
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
    yield redis_1.redis.del(pendingKey(teamId));
    // Immediate one-team refresh so the dashboard has data within seconds, not 6 hours.
    (0, analytics_service_1.runAnalyticsRefresh)({ teamId }).catch((err) => logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[MetaOAuth] Immediate refresh after connect failed'));
    return { page: chosen.name, instagram: hasInstagram };
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
/** Disconnect — revoke on Meta's side, delete both credential rows, reset rollups to not_connected. */
const disconnect = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const fbCred = yield platformCredential_model_1.PlatformCredential.findOne({ team_id: teamId, platform: 'facebook' }).select('+encrypted_token');
    if ((fbCred === null || fbCred === void 0 ? void 0 : fbCred.encrypted_token) && fbCred.page_id) {
        try {
            const pageToken = (0, crypto_2.decrypt)(fbCred.encrypted_token);
            const params = new URLSearchParams({ access_token: pageToken, appsecret_proof: (0, metaOAuth_graph_1.appSecretProof)(pageToken) });
            yield fetch(`${GRAPH_BASE()}/${fbCred.page_id}/permissions?${params.toString()}`, { method: 'DELETE' });
        }
        catch (err) {
            // Best-effort revocation — never block local cleanup if Meta's call fails.
            logger_1.logger.warn({ err: err instanceof Error ? err.message : err }, '[MetaOAuth] Meta-side revoke failed; continuing');
        }
    }
    yield platformCredential_model_1.PlatformCredential.deleteMany({ team_id: teamId, platform: { $in: ['facebook', 'instagram'] } });
    yield upsertNotConnectedRollup(teamId, 'facebook');
    yield upsertNotConnectedRollup(teamId, 'instagram');
});
/** Meta data-deletion callback — verify the signed_request, purge that Meta user's credentials. */
const handleDataDeletion = (signedRequest) => __awaiter(void 0, void 0, void 0, function* () {
    const { clientSecret } = requireFacebookAppConfig();
    const [encodedSig, payload] = (signedRequest !== null && signedRequest !== void 0 ? signedRequest : '').split('.');
    if (!encodedSig || !payload) {
        throw new AppError_1.default(httpStatus_1.httpStatus.BAD_REQUEST, 'Malformed signed_request');
    }
    const base64UrlDecode = (input) => Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const expectedSig = crypto_1.default.createHmac('sha256', clientSecret).update(payload).digest();
    const actualSig = base64UrlDecode(encodedSig);
    if (expectedSig.length !== actualSig.length || !crypto_1.default.timingSafeEqual(expectedSig, actualSig)) {
        throw new AppError_1.default(httpStatus_1.httpStatus.UNAUTHORIZED, 'Invalid signed_request signature');
    }
    const data = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    const confirmation_code = crypto_1.default.randomBytes(8).toString('hex');
    if (data.user_id) {
        yield platformCredential_model_1.PlatformCredential.deleteMany({ connected_by: data.user_id });
    }
    return { url: `${webUrl()}/data-deletion?code=${confirmation_code}`, confirmation_code };
});
exports.MetaOAuthService = {
    buildConnectUrl,
    handleCallback,
    listPendingPages,
    selectPage,
    disconnect,
    handleDataDeletion,
};
