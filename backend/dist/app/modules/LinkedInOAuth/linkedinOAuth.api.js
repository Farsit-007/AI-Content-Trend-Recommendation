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
exports.linkedinGet = exports.exchangeCodeForToken = exports.buildAuthorizeUrl = exports.LinkedInApiError = exports.LINKEDIN_API_VERSION = void 0;
const config_1 = __importDefault(require("../../config"));
const logger_1 = require("../../lib/logger");
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
exports.LINKEDIN_API_VERSION = '202506';
class LinkedInApiError extends Error {
    constructor(args) {
        super(args.message);
        this.name = 'LinkedInApiError';
        this.httpStatus = args.httpStatus;
        this.serviceErrorCode = args.serviceErrorCode;
    }
    /** True when the app simply lacks the product/permission (403) — the caller degrades gracefully. */
    get isForbidden() {
        return this.httpStatus === 403;
    }
    /** True when the stored token is dead/expired (401) — the team must reconnect. */
    get isUnauthorized() {
        return this.httpStatus === 401;
    }
}
exports.LinkedInApiError = LinkedInApiError;
const requireLinkedInAppConfig = () => {
    const { clientId, clientSecret } = config_1.default.platforms.linkedin;
    if (!clientId || !clientSecret) {
        throw new Error('LinkedIn app is not configured — set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET');
    }
    return { clientId, clientSecret };
};
/** Build the consent URL. Scopes are space-separated per the OAuth 2.0 spec. */
const buildAuthorizeUrl = (args) => {
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
exports.buildAuthorizeUrl = buildAuthorizeUrl;
/** Exchange an authorization code for an access token. */
const exchangeCodeForToken = (code, redirectUri) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { clientId, clientSecret } = requireLinkedInAppConfig();
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
    });
    const res = yield fetch(`${OAUTH_BASE}/accessToken`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const parsed = (yield res.json().catch(() => ({})));
    if (!res.ok || !parsed.access_token) {
        throw new LinkedInApiError({
            message: (_b = (_a = parsed.error_description) !== null && _a !== void 0 ? _a : parsed.error) !== null && _b !== void 0 ? _b : 'Failed to exchange code for LinkedIn token',
            httpStatus: res.status,
        });
    }
    return parsed;
});
exports.exchangeCodeForToken = exchangeCodeForToken;
const parseErrorEnvelope = (res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const body = (yield res.json().catch(() => ({})));
    throw new LinkedInApiError({
        message: (_c = (_b = (_a = body.message) !== null && _a !== void 0 ? _a : body.error_description) !== null && _b !== void 0 ? _b : body.error) !== null && _c !== void 0 ? _c : `LinkedIn API error (HTTP ${res.status})`,
        httpStatus: res.status,
        serviceErrorCode: body.serviceErrorCode,
    });
});
/**
 * GET a LinkedIn REST/v2 edge. `path` is API-base-relative, e.g. `v2/organizationalEntityAcls?...`
 * or `rest/posts?...`. Sends the auth token plus the Restli + version headers LinkedIn requires.
 */
const linkedinGet = (path, token) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `${API_BASE}/${path.replace(/^\//, '')}`;
    const isRest = path.replace(/^\//, '').startsWith('rest/');
    const res = yield fetch(url, {
        headers: Object.assign({ Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' }, (isRest ? { 'LinkedIn-Version': exports.LINKEDIN_API_VERSION } : {})),
    });
    if (!res.ok) {
        if (res.status >= 500) {
            logger_1.logger.warn({ status: res.status, path }, '[LinkedIn] Upstream error');
        }
        yield parseErrorEnvelope(res);
    }
    return (yield res.json().catch(() => ({})));
});
exports.linkedinGet = linkedinGet;
