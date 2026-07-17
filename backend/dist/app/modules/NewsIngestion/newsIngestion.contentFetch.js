"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.enrichContent = exports.extractFromUrl = exports.fetchGithubReadme = exports.fetchDevToBody = exports.mapWithConcurrency = void 0;
const config_1 = __importDefault(require("../../config"));
const logger_1 = require("../../lib/logger");
const htmlText_1 = require("./adapters/htmlText");
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/**
 * Runs `fn` over `items` with at most `limit` in flight at once, preserving input order in the
 * result array. A small local queue rather than a dependency — this pipeline has exactly one
 * call site for bounded concurrency.
 */
const mapWithConcurrency = (items, limit, fn) => __awaiter(void 0, void 0, void 0, function* () {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = () => __awaiter(void 0, void 0, void 0, function* () {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = yield fn(items[index]);
        }
    });
    const workerCount = Math.min(Math.max(limit, 1), items.length);
    yield Promise.all(Array.from({ length: workerCount }, worker));
    return results;
});
exports.mapWithConcurrency = mapWithConcurrency;
/** `GET /api/articles/{id}` — the full article body, not the description-only listing response. */
const fetchDevToBody = (sourceId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield fetch(`https://dev.to/api/articles/${sourceId}`);
        if (!res.ok)
            return undefined;
        const body = (yield res.json());
        return body.body_markdown || undefined;
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] dev.to body fetch failed for ${sourceId}`);
        return undefined;
    }
});
exports.fetchDevToBody = fetchDevToBody;
/** `GET /repos/{owner}/{repo}/readme` via the raw media type — README text, not the GitHub web UI page. */
const fetchGithubReadme = (sourceId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const headers = { Accept: 'application/vnd.github.raw+json' };
        if (config_1.default.news_ingestion.github_token) {
            headers.Authorization = `Bearer ${config_1.default.news_ingestion.github_token}`;
        }
        const res = yield fetch(`https://api.github.com/repos/${sourceId}/readme`, { headers });
        if (!res.ok)
            return undefined;
        const text = yield res.text();
        return text || undefined;
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : err }, `[NewsIngestion] GitHub README fetch failed for ${sourceId}`);
        return undefined;
    }
});
exports.fetchGithubReadme = fetchGithubReadme;
/**
 * Guarded fetch-then-extract for a linked page: our own fetch (so timeout/size/content-type
 * policy is always ours), then `article-extractor`'s HTML→article-text parsing only. Every
 * failure path returns undefined rather than throwing — this is enrichment, never gating.
 */
const extractFromUrl = (url) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config_1.default.news_ingestion.content_fetch.timeout_ms);
    try {
        const res = yield fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'GrowthStudioBot/1.0 (+news content enrichment)' },
        });
        if (!res.ok) {
            logger_1.logger.warn(`[NewsIngestion] content extraction: non-2xx status ${res.status} for ${url}`);
            return undefined;
        }
        const contentType = (_a = res.headers.get('content-type')) !== null && _a !== void 0 ? _a : '';
        if (!contentType.includes('text/html')) {
            logger_1.logger.warn(`[NewsIngestion] content extraction: non-HTML content-type "${contentType}" for ${url}`);
            return undefined;
        }
        const html = yield res.text();
        if (Buffer.byteLength(html, 'utf-8') > MAX_RESPONSE_BYTES) {
            logger_1.logger.warn(`[NewsIngestion] content extraction: response exceeded ${MAX_RESPONSE_BYTES} bytes for ${url}`);
            return undefined;
        }
        // Lazy-loaded: @extractus/article-extractor ships ESM-only, and this keeps that constraint
        // from leaking into every module that transitively imports this file (incl. under ts-jest,
        // which can't statically parse the package's ESM entry point at require() time).
        const { extractFromHtml } = yield Promise.resolve().then(() => __importStar(require('@extractus/article-extractor')));
        const article = yield extractFromHtml(html, url);
        const rawContent = article === null || article === void 0 ? void 0 : article.content;
        if (!rawContent) {
            logger_1.logger.warn(`[NewsIngestion] content extraction: no extractable article content for ${url}`);
            return undefined;
        }
        const text = (0, htmlText_1.decodeEntities)((0, htmlText_1.stripHtml)(rawContent)).replace(/\s+/g, ' ').trim();
        if (!text) {
            logger_1.logger.warn(`[NewsIngestion] content extraction: extracted text was empty after stripping for ${url}`);
            return undefined;
        }
        return text;
    }
    catch (err) {
        const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : (err instanceof Error ? err.message : err);
        logger_1.logger.warn({ err: reason }, `[NewsIngestion] content extraction failed for ${url}`);
        return undefined;
    }
    finally {
        clearTimeout(timeout);
    }
});
exports.extractFromUrl = extractFromUrl;
/**
 * Fills `content` for items that don't already have it (from `news-full-content-sources`'s
 * direct-from-adapter enrichment), routing dev.to and GitHub Trending to their respective APIs
 * and everything else to generic page extraction. Items that already carry content are passed
 * through untouched and contribute to neither count. A route that finds nothing marks the item
 * `content_status: 'failed'` rather than leaving it ambiguous with "never attempted".
 */
const enrichContent = (items) => __awaiter(void 0, void 0, void 0, function* () {
    const countsBySource = {};
    const bump = (source, key) => {
        var _a;
        countsBySource[source] = (_a = countsBySource[source]) !== null && _a !== void 0 ? _a : { fetched: 0, failed: 0 };
        countsBySource[source][key] += 1;
    };
    const enriched = yield (0, exports.mapWithConcurrency)(items, config_1.default.news_ingestion.content_fetch.concurrency, (item) => __awaiter(void 0, void 0, void 0, function* () {
        if (item.content)
            return item;
        const fetchedText = item.source === 'devto'
            ? yield (0, exports.fetchDevToBody)(item.source_id)
            : item.source === 'github_trending'
                ? yield (0, exports.fetchGithubReadme)(item.source_id)
                : yield (0, exports.extractFromUrl)(item.url);
        if (fetchedText) {
            bump(item.source, 'fetched');
            return Object.assign(Object.assign({}, item), { content: fetchedText });
        }
        bump(item.source, 'failed');
        return Object.assign(Object.assign({}, item), { content_status: 'failed' });
    }));
    return { items: enriched, countsBySource };
});
exports.enrichContent = enrichContent;
