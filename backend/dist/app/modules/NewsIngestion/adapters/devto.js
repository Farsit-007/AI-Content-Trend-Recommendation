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
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchDevTo = void 0;
const logger_1 = require("../../../lib/logger");
const TOP_URL = 'https://dev.to/api/articles?top=1&per_page=50';
const RISING_URL = 'https://dev.to/api/articles?state=rising&per_page=50';
const fetchArticles = (url) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield fetch(url);
        if (!res.ok)
            throw new Error(`Dev.to request failed for ${url}: ${res.status}`);
        return (yield res.json());
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] Dev.to request failed: ${url}`);
        return null;
    }
});
/** `top=1` (daily top) and `state=rising` are fetched together so results fit the 72h freshness window that `?top=7` (weekly) missed. */
const fetchDevTo = () => __awaiter(void 0, void 0, void 0, function* () {
    const [top, rising] = yield Promise.all([fetchArticles(TOP_URL), fetchArticles(RISING_URL)]);
    if (top === null && rising === null) {
        throw new Error('Dev.to request failed: both top and rising requests failed');
    }
    const merged = new Map();
    for (const article of [...(top !== null && top !== void 0 ? top : []), ...(rising !== null && rising !== void 0 ? rising : [])]) {
        merged.set(article.id, article);
    }
    return Array.from(merged.values()).map((article) => {
        var _a, _b;
        return ({
            source: 'devto',
            source_id: String(article.id),
            title: article.title,
            url: article.url,
            snippet: article.description,
            published_at: article.published_at ? new Date(article.published_at) : undefined,
            raw_points: (_a = article.public_reactions_count) !== null && _a !== void 0 ? _a : 0,
            raw_comments: (_b = article.comments_count) !== null && _b !== void 0 ? _b : 0,
            raw_stars_delta: 0,
        });
    });
});
exports.fetchDevTo = fetchDevTo;
