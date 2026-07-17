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
exports.fetchGithubTrending = exports.enrichTitle = void 0;
const config_1 = __importDefault(require("../../../config"));
const logger_1 = require("../../../lib/logger");
const htmlText_1 = require("./htmlText");
/**
 * GitHub has no official trending API, so one fetch path scrapes the public trending page's
 * HTML with targeted regexes — inherently brittle, since a markup change silently returns fewer
 * (or zero) matches rather than throwing. A second, official-API-based path (recently-created
 * popular repos) supplements it: it isn't starved by hash-dedup the way a slow-moving trending
 * list is (a repo trending for days gets hash-deduped after its first successful run — see
 * design.md), and it carries a real `created_at`/`description` the scrape can't reliably extract.
 * The two paths are merged; see `fetchGithubTrending` for the soft-failure-vs-real-failure logic.
 */
const SEARCH_API_URL = 'https://api.github.com/search/repositories';
const TITLE_TRUNCATE_LENGTH = 200;
/** Strengthens a bare `owner/repo` title's relevance-scoring signal with real semantic content. */
const enrichTitle = (fullName, description) => {
    if (!description)
        return fullName;
    const truncated = description.length > TITLE_TRUNCATE_LENGTH ? `${description.slice(0, TITLE_TRUNCATE_LENGTH)}…` : description;
    return `${fullName} — ${truncated}`;
};
exports.enrichTitle = enrichTitle;
const extractRepoBlocks = (html) => {
    const matches = html.match(/<article class="Box-row"[\s\S]*?<\/article>/g);
    return matches !== null && matches !== void 0 ? matches : [];
};
const parseRepoBlock = (block) => {
    const hrefMatch = block.match(/<a[^>]*href="\/([^"/]+\/[^"?#]+)"/);
    if (!hrefMatch)
        return null;
    const repoPath = hrefMatch[1];
    const descriptionMatch = block.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/);
    const snippet = descriptionMatch ? (0, htmlText_1.decodeEntities)((0, htmlText_1.stripHtml)(descriptionMatch[1])) : undefined;
    const starsMatch = block.match(/([\d,]+)\s+stars?\s+today/);
    const starsToday = starsMatch ? Number(starsMatch[1].replace(/,/g, '')) : 0;
    return {
        source: 'github_trending',
        source_id: repoPath,
        title: (0, exports.enrichTitle)(repoPath, snippet),
        url: `https://github.com/${repoPath}`,
        snippet,
        published_at: undefined,
        raw_points: 0,
        raw_comments: 0,
        raw_stars_delta: starsToday,
    };
};
/** Zero parsed blocks from a 200 response is a legitimate empty result here, not a throw — the
 * caller (`fetchGithubTrending`) decides whether that's an overall failure using both paths. */
const fetchTrendingScrape = () => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield fetch('https://github.com/trending', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthStudioBot/1.0)' },
    });
    if (!res.ok)
        throw new Error(`GitHub trending request failed: ${res.status}`);
    const html = yield res.text();
    return extractRepoBlocks(html)
        .map(parseRepoBlock)
        .filter((item) => item !== null);
});
/** UTC YYYY-MM-DD, tracking NEWS_INGESTION_MAX_AGE_HOURS so the query window matches the
 * pipeline's own freshness filter — the same mismatch `news-source-quick-wins` fixed for dev.to. */
const freshnessWindowStartDate = () => {
    const cutoff = new Date(Date.now() - config_1.default.news_ingestion.max_age_hours * 60 * 60 * 1000);
    return cutoff.toISOString().slice(0, 10);
};
const fetchRecentPopular = () => __awaiter(void 0, void 0, void 0, function* () {
    const query = `created:>=${freshnessWindowStartDate()}`;
    const url = `${SEARCH_API_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`;
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (config_1.default.news_ingestion.github_token) {
        headers.Authorization = `Bearer ${config_1.default.news_ingestion.github_token}`;
    }
    const res = yield fetch(url, { headers });
    if (!res.ok)
        throw new Error(`GitHub Search API request failed: ${res.status}`);
    const body = (yield res.json());
    if (!Array.isArray(body.items))
        throw new Error('GitHub Search API returned an unexpected response shape');
    return body.items.map((repo) => {
        var _a;
        return ({
            source: 'github_trending',
            source_id: repo.full_name,
            title: (0, exports.enrichTitle)(repo.full_name, repo.description),
            url: repo.html_url,
            snippet: (_a = repo.description) !== null && _a !== void 0 ? _a : undefined,
            published_at: new Date(repo.created_at),
            raw_points: 0,
            raw_comments: 0,
            raw_stars_delta: repo.stargazers_count,
        });
    });
});
const fetchGithubTrending = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const [scrapeResult, apiResult] = yield Promise.allSettled([fetchTrendingScrape(), fetchRecentPopular()]);
    const scrapeItems = scrapeResult.status === 'fulfilled' ? scrapeResult.value : [];
    const apiItems = apiResult.status === 'fulfilled' ? apiResult.value : [];
    const merged = new Map();
    for (const item of [...scrapeItems, ...apiItems]) {
        if (!merged.has(item.source_id))
            merged.set(item.source_id, item);
    }
    const items = Array.from(merged.values());
    if (items.length > 0) {
        // One path failing while the other delivers is not this source's failure — log it and move on.
        if (scrapeResult.status === 'rejected') {
            logger_1.logger.error({ err: (_b = (_a = scrapeResult.reason) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : scrapeResult.reason }, '[NewsIngestion] GitHub Trending scrape failed');
        }
        if (apiResult.status === 'rejected') {
            logger_1.logger.error({ err: (_d = (_c = apiResult.reason) === null || _c === void 0 ? void 0 : _c.message) !== null && _d !== void 0 ? _d : apiResult.reason }, '[NewsIngestion] GitHub Search API failed');
        }
        return items;
    }
    // Empty merged result: distinguish "both paths legitimately found nothing" (not an error) from
    // "at least one path actually broke" (a real failure the run history should surface).
    if (scrapeResult.status === 'rejected' || apiResult.status === 'rejected') {
        const reasons = [
            scrapeResult.status === 'rejected' ? `scrape: ${(_f = (_e = scrapeResult.reason) === null || _e === void 0 ? void 0 : _e.message) !== null && _f !== void 0 ? _f : scrapeResult.reason}` : null,
            apiResult.status === 'rejected' ? `search API: ${(_h = (_g = apiResult.reason) === null || _g === void 0 ? void 0 : _g.message) !== null && _h !== void 0 ? _h : apiResult.reason}` : null,
        ].filter(Boolean);
        throw new Error(`GitHub Trending: both fetch paths yielded nothing (${reasons.join('; ')})`);
    }
    return items;
});
exports.fetchGithubTrending = fetchGithubTrending;
