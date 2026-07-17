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
exports.fetchGNews = void 0;
const config_1 = __importDefault(require("../../../config"));
const logger_1 = require("../../../lib/logger");
const MAX_QUERIES = 3;
const ITEMS_PER_QUERY = 10;
const SEARCH_URL = 'https://gnews.io/api/v4/search';
const fetchTopicArticles = (topic) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { api_key } = config_1.default.news_ingestion.gnews;
    const url = `${SEARCH_URL}?q=${encodeURIComponent(topic)}&lang=en&max=${ITEMS_PER_QUERY}&apikey=${api_key}`;
    const res = yield fetch(url);
    const body = (yield res.json());
    if (!res.ok || !Array.isArray(body.articles)) {
        const detail = (_b = (_a = body.errors) === null || _a === void 0 ? void 0 : _a.join('; ')) !== null && _b !== void 0 ? _b : res.status;
        throw new Error(`GNews request failed for topic "${topic}": ${detail}`);
    }
    return body.articles.map((article) => ({
        source: 'gnews',
        source_id: article.url,
        title: article.title,
        url: article.url,
        snippet: article.description,
        published_at: new Date(article.publishedAt),
        raw_points: 0,
        raw_comments: 0,
        raw_stars_delta: 0,
    }));
});
const fetchGNews = () => __awaiter(void 0, void 0, void 0, function* () {
    const { api_key, queries } = config_1.default.news_ingestion.gnews;
    if (!api_key || queries.length === 0) {
        // Throwing (rather than resolving to []) is deliberate: `runAllAdapters` catches this and
        // records it as this run's `error` for the gnews source, so run history shows an honest
        // "not configured" reason instead of looking like a source that just returned nothing.
        const message = 'gnews not configured (GNEWS_API_KEY/NEWS_INGESTION_GNEWS_QUERIES unset)';
        logger_1.logger.warn(`[NewsIngestion] ${message} — skipping`);
        throw new Error(message);
    }
    const topics = queries.slice(0, MAX_QUERIES);
    if (queries.length > MAX_QUERIES) {
        logger_1.logger.warn(`[NewsIngestion] GNews: ${queries.length} topics configured, only using the first ${MAX_QUERIES}`);
    }
    const results = yield Promise.allSettled(topics.map((topic) => fetchTopicArticles(topic)));
    const items = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    const failures = results
        .map((result, i) => { var _a, _b; return (result.status === 'rejected' ? `${topics[i]}: ${(_b = (_a = result.reason) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : result.reason}` : null); })
        .filter((reason) => reason !== null);
    if (items.length === 0 && failures.length > 0) {
        throw new Error(`GNews: all queries failed (${failures.join('; ')})`);
    }
    for (const reason of failures) {
        logger_1.logger.error(`[NewsIngestion] GNews query failed: ${reason}`);
    }
    return items;
});
exports.fetchGNews = fetchGNews;
