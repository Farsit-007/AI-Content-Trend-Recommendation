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
exports.fetchReddit = exports.getAppToken = void 0;
const config_1 = __importDefault(require("../../../config"));
const logger_1 = require("../../../lib/logger");
const redis_1 = require("../../../lib/redis");
const TOKEN_CACHE_KEY = 'reddit:app_token';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
/** Distinguishes an expired/revoked token (worth one retry with a fresh token) from any other failure. */
class RedditAuthError extends Error {
}
const requestAppToken = () => __awaiter(void 0, void 0, void 0, function* () {
    const { client_id, client_secret, user_agent } = config_1.default.news_ingestion.reddit;
    const basicAuth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
    const res = yield fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': user_agent,
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok)
        throw new Error(`Reddit token request failed: ${res.status}`);
    return (yield res.json());
});
/** Caches the app-only bearer token in Redis so repeated pipeline runs (cron or manual) reuse one token. */
const getAppToken = () => __awaiter(void 0, void 0, void 0, function* () {
    const cached = yield redis_1.redis.get(TOKEN_CACHE_KEY);
    if (cached)
        return cached;
    const { access_token, expires_in } = yield requestAppToken();
    // 60s margin so a token is never used within a minute of its real expiry.
    yield redis_1.redis.set(TOKEN_CACHE_KEY, access_token, 'EX', Math.max(expires_in - 60, 60));
    return access_token;
});
exports.getAppToken = getAppToken;
const fetchSubredditListing = (subreddit, token) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield fetch(`https://oauth.reddit.com/r/${subreddit}/top.json?limit=25&t=day`, {
        headers: {
            Authorization: `bearer ${token}`,
            'User-Agent': config_1.default.news_ingestion.reddit.user_agent,
        },
    });
    if (res.status === 401)
        throw new RedditAuthError(`Reddit request unauthorized for r/${subreddit}`);
    if (!res.ok)
        throw new Error(`Reddit request failed for r/${subreddit}: ${res.status}`);
    const listing = (yield res.json());
    return listing.data.children.map(({ data: post }) => {
        var _a, _b, _c;
        return ({
            source: 'reddit',
            source_id: post.id,
            title: post.title,
            url: `https://www.reddit.com${post.permalink}`,
            snippet: (_a = post.selftext) === null || _a === void 0 ? void 0 : _a.slice(0, 500),
            published_at: post.created_utc ? new Date(post.created_utc * 1000) : undefined,
            raw_points: (_b = post.ups) !== null && _b !== void 0 ? _b : 0,
            raw_comments: (_c = post.num_comments) !== null && _c !== void 0 ? _c : 0,
            raw_stars_delta: 0,
        });
    });
});
/** On an expired/revoked token, invalidate the cache, obtain a fresh token, and retry exactly once. */
const fetchSubredditWithRetry = (subreddit, token) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return yield fetchSubredditListing(subreddit, token);
    }
    catch (err) {
        if (!(err instanceof RedditAuthError))
            throw err;
        yield redis_1.redis.del(TOKEN_CACHE_KEY);
        const freshToken = yield (0, exports.getAppToken)();
        return fetchSubredditListing(subreddit, freshToken);
    }
});
const fetchReddit = () => __awaiter(void 0, void 0, void 0, function* () {
    const { client_id, client_secret } = config_1.default.news_ingestion.reddit;
    if (!client_id || !client_secret) {
        // Throwing (rather than resolving to []) is deliberate: `runAllAdapters` catches this and
        // records it as this run's `error` for the reddit source, so run history shows an honest
        // "not configured" reason instead of looking like a source that just returned nothing.
        const message = 'Reddit not configured (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET unset)';
        logger_1.logger.warn(`[NewsIngestion] ${message} — skipping`);
        throw new Error(message);
    }
    const token = yield (0, exports.getAppToken)();
    const results = yield Promise.all(config_1.default.news_ingestion.reddit_subreddits.map((subreddit) => fetchSubredditWithRetry(subreddit, token).catch((err) => {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] Reddit r/${subreddit} failed`);
        return [];
    })));
    return results.flat();
});
exports.fetchReddit = fetchReddit;
