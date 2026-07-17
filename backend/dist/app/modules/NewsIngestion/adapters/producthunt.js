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
exports.fetchProductHunt = void 0;
const config_1 = __importDefault(require("../../../config"));
const logger_1 = require("../../../lib/logger");
const redis_1 = require("../../../lib/redis");
const TOKEN_CACHE_KEY = 'producthunt:app_token';
const TOKEN_URL = 'https://api.producthunt.com/v2/oauth/token';
const GRAPHQL_URL = 'https://api.producthunt.com/v2/api/graphql';
// Not derived from a token-response expires_in (Product Hunt's client-credentials tokens have no
// documented contractual lifetime) — a conservative fixed TTL just saves a daily re-auth request;
// the 401-triggered retry below is the actual correctness net for early revocation.
const TOKEN_TTL_SECONDS = 86400;
const QUERY = `
  query TopLaunches($postedAfter: DateTime!) {
    posts(order: VOTES, postedAfter: $postedAfter, first: 25) {
      edges {
        node { id name tagline description url votesCount commentsCount createdAt }
      }
    }
  }
`;
/** Distinguishes an expired/revoked token (worth one retry with a fresh token) from any other failure. */
class ProductHuntAuthError extends Error {
}
const requestAppToken = () => __awaiter(void 0, void 0, void 0, function* () {
    const { client_id, client_secret } = config_1.default.news_ingestion.producthunt;
    const res = yield fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id, client_secret, grant_type: 'client_credentials' }),
    });
    if (!res.ok)
        throw new Error(`Product Hunt token request failed: ${res.status}`);
    return (yield res.json());
});
/** Caches the app-only bearer token in Redis so repeated pipeline runs (cron or manual) reuse one token. */
const getAppToken = () => __awaiter(void 0, void 0, void 0, function* () {
    const cached = yield redis_1.redis.get(TOKEN_CACHE_KEY);
    if (cached)
        return cached;
    const { access_token } = yield requestAppToken();
    yield redis_1.redis.set(TOKEN_CACHE_KEY, access_token, 'EX', TOKEN_TTL_SECONDS);
    return access_token;
});
const fetchTopLaunches = (token) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const postedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = yield fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: QUERY, variables: { postedAfter } }),
    });
    if (res.status === 401)
        throw new ProductHuntAuthError('Product Hunt GraphQL request unauthorized');
    if (!res.ok)
        throw new Error(`Product Hunt GraphQL request failed: ${res.status}`);
    const body = (yield res.json());
    // A GraphQL server can return HTTP 200 with an `errors` array and no `data` — res.ok alone would
    // never catch this, and a naive implementation would silently emit zero items instead of erroring.
    if (body.errors && body.errors.length > 0) {
        throw new Error(`Product Hunt GraphQL error: ${body.errors[0].message}`);
    }
    if (!((_a = body.data) === null || _a === void 0 ? void 0 : _a.posts)) {
        throw new Error('Product Hunt GraphQL returned an unexpected response shape');
    }
    return body.data.posts.edges.map(({ node }) => ({
        source: 'producthunt',
        source_id: node.id,
        title: `${node.name} — ${node.tagline}`,
        url: node.url,
        snippet: node.tagline,
        content: node.description || undefined,
        published_at: new Date(node.createdAt),
        raw_points: node.votesCount,
        raw_comments: node.commentsCount,
        raw_stars_delta: 0,
    }));
});
/** On an expired/revoked token, invalidate the cache, obtain a fresh token, and retry exactly once. */
const fetchTopLaunchesWithRetry = (token) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield fetchTopLaunches(token);
    }
    catch (err) {
        if (!(err instanceof ProductHuntAuthError))
            throw err;
        yield redis_1.redis.del(TOKEN_CACHE_KEY);
        const freshToken = yield getAppToken();
        return fetchTopLaunches(freshToken);
    }
});
const fetchProductHunt = () => __awaiter(void 0, void 0, void 0, function* () {
    const { client_id, client_secret } = config_1.default.news_ingestion.producthunt;
    if (!client_id || !client_secret) {
        // Throwing (rather than resolving to []) is deliberate: `runAllAdapters` catches this and
        // records it as this run's `error` for the producthunt source, so run history shows an honest
        // "not configured" reason instead of looking like a source that just returned nothing.
        const message = 'producthunt not configured (PRODUCTHUNT_CLIENT_ID/PRODUCTHUNT_CLIENT_SECRET unset)';
        logger_1.logger.warn(`[NewsIngestion] ${message} — skipping`);
        throw new Error(message);
    }
    const token = yield getAppToken();
    return fetchTopLaunchesWithRetry(token);
});
exports.fetchProductHunt = fetchProductHunt;
