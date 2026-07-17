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
exports.isTokenDeadError = exports.graphBatch = exports.graphGet = exports.appSecretProof = exports.GraphApiError = void 0;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = __importDefault(require("../../config"));
const logger_1 = require("../../lib/logger");
/**
 * Tiny typed wrapper around the Meta Graph API. Everything server-side goes through here so the
 * version pin, `appsecret_proof`, error-envelope parsing, and rate-limit header handling live in
 * exactly one place.
 *
 * Graph error envelope: `{ error: { message, type, code, error_subcode } }`.
 */
const GRAPH_BASE = () => `https://graph.facebook.com/${config_1.default.analytics.graph_api_version}`;
/** Meta's app-usage abort threshold — at/over this we stop making calls (taxonomy code-4 path). */
const USAGE_ABORT_THRESHOLD = 90;
const USAGE_WARN_THRESHOLD = 75;
class GraphApiError extends Error {
    constructor(args) {
        super(args.message);
        this.name = 'GraphApiError';
        this.code = args.code;
        this.subcode = args.subcode;
        this.type = args.type;
        this.httpStatus = args.httpStatus;
    }
}
exports.GraphApiError = GraphApiError;
/**
 * `appsecret_proof` = HMAC-SHA256(access_token) keyed by the app secret. Sent on every
 * server-side call; combined with "Require App Secret" on the app it makes a stolen token
 * useless off our server.
 */
const appSecretProof = (token) => {
    const secret = config_1.default.platforms.facebook.clientSecret;
    if (!secret)
        throw new Error('FB_CLIENT_SECRET is not configured — cannot sign Graph calls');
    return crypto_1.default.createHmac('sha256', secret).update(token).digest('hex');
};
exports.appSecretProof = appSecretProof;
/**
 * Reads `X-App-Usage` / `X-Business-Use-Case-Usage` and returns the peak utilization percent seen.
 * Logs a warning at >75%. The caller decides what to do at the abort threshold.
 */
const readUsage = (headers) => {
    let peak = 0;
    const scan = (raw) => {
        if (!raw)
            return;
        try {
            const parsed = JSON.parse(raw);
            const collect = (obj) => {
                for (const v of Object.values(obj)) {
                    if (typeof v === 'number')
                        peak = Math.max(peak, v);
                }
            };
            // X-App-Usage is a flat object; X-Business-Use-Case-Usage is keyed by business id → array.
            if (Array.isArray(parsed)) {
                for (const entry of parsed)
                    collect(entry);
            }
            else {
                for (const v of Object.values(parsed)) {
                    if (typeof v === 'number')
                        peak = Math.max(peak, v);
                    else if (Array.isArray(v))
                        for (const e of v)
                            collect(e);
                    else if (v && typeof v === 'object')
                        collect(v);
                }
            }
        }
        catch (_a) {
            // Malformed usage header — ignore, it must never break a successful data call.
        }
    };
    scan(headers.get('x-app-usage'));
    scan(headers.get('x-business-use-case-usage'));
    if (peak >= USAGE_WARN_THRESHOLD) {
        logger_1.logger.warn({ usagePercent: peak }, '[MetaGraph] Graph API rate-limit utilization high');
    }
    return peak;
};
const buildQuery = (params, token) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null)
            search.set(k, String(v));
    }
    search.set('access_token', token);
    search.set('appsecret_proof', (0, exports.appSecretProof)(token));
    return search.toString();
};
const throwFromEnvelope = (body, httpStatus) => {
    var _a, _b;
    const err = body === null || body === void 0 ? void 0 : body.error;
    throw new GraphApiError({
        code: (_a = err === null || err === void 0 ? void 0 : err.code) !== null && _a !== void 0 ? _a : 0,
        subcode: err === null || err === void 0 ? void 0 : err.error_subcode,
        type: err === null || err === void 0 ? void 0 : err.type,
        message: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : `Graph API error (HTTP ${httpStatus})`,
        httpStatus,
    });
};
/** GET a Graph edge. `path` is version-relative, e.g. `me/accounts` or `{page-id}/published_posts`. */
const graphGet = (path, params, token) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `${GRAPH_BASE()}/${path.replace(/^\//, '')}?${buildQuery(params, token)}`;
    const res = yield fetch(url);
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
    const body = (yield res.json().catch(() => ({})));
    if (!res.ok || body.error) {
        throwFromEnvelope(body, res.status);
    }
    return body;
});
exports.graphGet = graphGet;
/**
 * Batched GET via `POST /` with a `batch=[...]` array (≤50 sub-requests). Used for per-media IG
 * insights so 25 media = 1 HTTP call. Returns the parsed body of each sub-response in order;
 * a sub-request that itself errored yields `{ error }` which the caller tolerates per-item.
 */
const graphBatch = (relativeUrls, token) => __awaiter(void 0, void 0, void 0, function* () {
    const batch = relativeUrls.map((relative_url) => ({ method: 'GET', relative_url }));
    const search = new URLSearchParams();
    search.set('access_token', token);
    search.set('appsecret_proof', (0, exports.appSecretProof)(token));
    search.set('batch', JSON.stringify(batch));
    const res = yield fetch(`${GRAPH_BASE()}/`, {
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
    const body = (yield res.json().catch(() => ({})));
    if (!res.ok || body.error) {
        throwFromEnvelope(body, res.status);
    }
    // Each element: { code, body } where body is a JSON string, or null if the sub-request timed out.
    return body.map((sub) => {
        if (!sub || sub.body === null)
            return { error: { code: 0, message: 'Empty batch sub-response' } };
        try {
            return JSON.parse(sub.body);
        }
        catch (_a) {
            return { error: { code: 0, message: 'Unparseable batch sub-response' } };
        }
    });
});
exports.graphBatch = graphBatch;
/** True when a Graph error means the stored token is dead and the user must reconnect. */
const isTokenDeadError = (err) => err instanceof GraphApiError && err.code === 190;
exports.isTokenDeadError = isTokenDeadError;
