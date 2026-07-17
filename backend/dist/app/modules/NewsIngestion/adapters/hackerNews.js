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
exports.fetchHackerNews = void 0;
const logger_1 = require("../../../lib/logger");
const htmlText_1 = require("./htmlText");
const FRONT_PAGE_URL = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';
const RISERS_URL = 'https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E50&hitsPerPage=50';
const fetchAlgolia = (url) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield fetch(url);
        if (!res.ok)
            throw new Error(`HackerNews (Algolia) request failed for ${url}: ${res.status}`);
        const body = (yield res.json());
        return body.hits;
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] HackerNews (Algolia) request failed: ${url}`);
        return null;
    }
});
/** Front page + risers (points>50, by date) replace the old 31-request Firebase flow with 2 requests. */
const fetchHackerNews = () => __awaiter(void 0, void 0, void 0, function* () {
    const [frontPage, risers] = yield Promise.all([fetchAlgolia(FRONT_PAGE_URL), fetchAlgolia(RISERS_URL)]);
    if (frontPage === null && risers === null) {
        throw new Error('HackerNews (Algolia) request failed: both front-page and risers requests failed');
    }
    const merged = new Map();
    for (const hit of [...(frontPage !== null && frontPage !== void 0 ? frontPage : []), ...(risers !== null && risers !== void 0 ? risers : [])]) {
        if (!merged.has(hit.objectID))
            merged.set(hit.objectID, hit);
    }
    return Array.from(merged.values())
        .filter((hit) => !!hit.title)
        .map((hit) => {
        var _a, _b, _c;
        return ({
            source: 'hackernews',
            source_id: String(hit.objectID),
            title: hit.title,
            url: (_a = hit.url) !== null && _a !== void 0 ? _a : `https://news.ycombinator.com/item?id=${hit.objectID}`,
            snippet: hit.story_text ? (0, htmlText_1.stripHtml)(hit.story_text) : undefined,
            content: hit.story_text ? (0, htmlText_1.stripHtml)(hit.story_text) : undefined,
            published_at: hit.created_at_i ? new Date(hit.created_at_i * 1000) : undefined,
            raw_points: (_b = hit.points) !== null && _b !== void 0 ? _b : 0,
            raw_comments: (_c = hit.num_comments) !== null && _c !== void 0 ? _c : 0,
            raw_stars_delta: 0,
        });
    });
});
exports.fetchHackerNews = fetchHackerNews;
