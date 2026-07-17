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
exports.REFRESHABLE_SOURCES = exports.ENGAGEMENT_FETCHERS = void 0;
const config_1 = __importDefault(require("../../config"));
const logger_1 = require("../../lib/logger");
const reddit_1 = require("../NewsIngestion/adapters/reddit");
const chunk = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size)
        chunks.push(arr.slice(i, i + size));
    return chunks;
};
const HN_ITEM_URL = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
/** 1 request per item (same endpoint the ingestion adapter's Firebase path already used). */
const fetchHackerNewsEngagement = (items) => __awaiter(void 0, void 0, void 0, function* () {
    let requestsUsed = 0;
    const results = [];
    yield Promise.all(items.map((_a) => __awaiter(void 0, [_a], void 0, function* ({ source_id }) {
        var _b, _c;
        requestsUsed += 1;
        try {
            const res = yield fetch(HN_ITEM_URL(source_id));
            if (res.status === 404) {
                results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
                return;
            }
            if (!res.ok)
                throw new Error(`HackerNews item request failed: ${res.status}`);
            const body = (yield res.json());
            // The Firebase item endpoint returns a JSON `null` body (HTTP 200) for a removed story.
            if (!body || body.deleted || body.dead) {
                results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
                return;
            }
            results.push({ source_id, points: (_b = body.score) !== null && _b !== void 0 ? _b : 0, comments: (_c = body.descendants) !== null && _c !== void 0 ? _c : 0, stars_delta: 0, removed: false });
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsRefresh] HackerNews item ${source_id} refresh failed`);
        }
    })));
    return { results, requestsUsed };
});
const DEVTO_ARTICLE_URL = (id) => `https://dev.to/api/articles/${id}`;
/** 1 request per item. */
const fetchDevToEngagement = (items) => __awaiter(void 0, void 0, void 0, function* () {
    let requestsUsed = 0;
    const results = [];
    yield Promise.all(items.map((_a) => __awaiter(void 0, [_a], void 0, function* ({ source_id }) {
        var _b, _c;
        requestsUsed += 1;
        try {
            const res = yield fetch(DEVTO_ARTICLE_URL(source_id));
            if (res.status === 404 || res.status === 410) {
                results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
                return;
            }
            if (!res.ok)
                throw new Error(`Dev.to article request failed: ${res.status}`);
            const body = (yield res.json());
            results.push({
                source_id,
                points: (_b = body.public_reactions_count) !== null && _b !== void 0 ? _b : 0,
                comments: (_c = body.comments_count) !== null && _c !== void 0 ? _c : 0,
                stars_delta: 0,
                removed: false,
            });
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsRefresh] Dev.to article ${source_id} refresh failed`);
        }
    })));
    return { results, requestsUsed };
});
const REDDIT_CHUNK_SIZE = 100;
const REDDIT_INFO_URL = 'https://oauth.reddit.com/api/info';
/** Batches up to 100 fullnames per request using the same cached OAuth app token the
 * ingestion adapter uses. Stored `source_id` is the bare post id; the info endpoint needs
 * `t3_`-prefixed fullnames. Maps the response back to items by `data.name`, never by
 * response order (the listing endpoint doesn't guarantee it). Credential-gated: skips
 * entirely (with a logged reason) when Reddit isn't configured. */
const fetchRedditEngagement = (items) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { client_id, client_secret } = config_1.default.news_ingestion.reddit;
    if (!client_id || !client_secret) {
        logger_1.logger.warn('[NewsRefresh] Reddit not configured (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET unset) — skipping refresh');
        return { results: [], requestsUsed: 0 };
    }
    let requestsUsed = 0;
    const results = [];
    const token = yield (0, reddit_1.getAppToken)();
    for (const batch of chunk(items, REDDIT_CHUNK_SIZE)) {
        requestsUsed += 1;
        try {
            const fullnames = batch.map(({ source_id }) => `t3_${source_id}`).join(',');
            const res = yield fetch(`${REDDIT_INFO_URL}?id=${fullnames}`, {
                headers: {
                    Authorization: `bearer ${token}`,
                    'User-Agent': config_1.default.news_ingestion.reddit.user_agent,
                },
            });
            if (!res.ok)
                throw new Error(`Reddit info request failed: ${res.status}`);
            const listing = (yield res.json());
            const bySourceId = new Map(listing.data.children.map(({ data }) => [data.name.replace(/^t3_/, ''), data]));
            for (const { source_id } of batch) {
                const post = bySourceId.get(source_id);
                if (!post) {
                    // Missing from the listing means Reddit is no longer serving this post.
                    results.push({ source_id, points: 0, comments: 0, stars_delta: 0, removed: true });
                    continue;
                }
                results.push({ source_id, points: (_a = post.ups) !== null && _a !== void 0 ? _a : 0, comments: (_b = post.num_comments) !== null && _b !== void 0 ? _b : 0, stars_delta: 0, removed: false });
            }
        }
        catch (err) {
            logger_1.logger.error({ err: err instanceof Error ? err.message : err }, '[NewsRefresh] Reddit batch refresh failed');
        }
    }
    return { results, requestsUsed };
});
/** Extension point (design.md decision 8): a future source gains re-polling by adding one entry
 * here — no other job code changes. `github_trending` and `rss:*` are deliberately never
 * registered (no cheap per-item re-fetch signal). */
exports.ENGAGEMENT_FETCHERS = {
    hackernews: fetchHackerNewsEngagement,
    reddit: fetchRedditEngagement,
    devto: fetchDevToEngagement,
};
exports.REFRESHABLE_SOURCES = Object.keys(exports.ENGAGEMENT_FETCHERS);
