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
exports.fetchRss = exports.feedLabel = void 0;
const rss_parser_1 = __importDefault(require("rss-parser"));
const config_1 = __importDefault(require("../../../config"));
const logger_1 = require("../../../lib/logger");
// Conditional GET (HTTP 304) is deliberately not implemented: a feed correctly answering 304
// would legitimately show fetched: 0 for that run, which the zero-streak alert can't currently
// tell apart from a dead feed without plumbing a per-feed HTTP-status signal through
// AdapterResult/IngestionRun — not worth it at ~200 requests/day. Revisit past ~50 feeds.
const parser = new rss_parser_1.default({ timeout: 10000 });
/** `rss:<hostname>` (lowercased, `www.` stripped) so per-feed health is visible; falls back to `rss` for an unparseable feed URL. */
const feedLabel = (feedUrl) => {
    try {
        const hostname = new URL(feedUrl).hostname.toLowerCase().replace(/^www\./, '');
        return `rss:${hostname}`;
    }
    catch (_a) {
        return 'rss';
    }
};
exports.feedLabel = feedLabel;
const fetchFeed = (feedUrl) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const feed = yield parser.parseURL(feedUrl);
    const source = (0, exports.feedLabel)(feedUrl);
    return ((_a = feed.items) !== null && _a !== void 0 ? _a : [])
        .filter((item) => item.link && item.title)
        .map((item) => {
        var _a;
        return ({
            source,
            source_id: (_a = item.guid) !== null && _a !== void 0 ? _a : item.link,
            title: item.title,
            url: item.link,
            snippet: item.contentSnippet,
            published_at: item.isoDate ? new Date(item.isoDate) : undefined,
            raw_points: 0,
            raw_comments: 0,
            raw_stars_delta: 0,
        });
    });
});
const fetchRss = () => __awaiter(void 0, void 0, void 0, function* () {
    const results = yield Promise.all(config_1.default.news_ingestion.rss_feeds.map((feedUrl) => fetchFeed(feedUrl).catch((err) => {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] RSS feed ${feedUrl} failed`);
        return [];
    })));
    return results.flat();
});
exports.fetchRss = fetchRss;
