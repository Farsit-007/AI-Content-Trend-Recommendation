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
jest.mock('../app/config', () => ({
    __esModule: true,
    default: {
        news_ingestion: {
            max_age_hours: 72,
            github_token: undefined,
        },
    },
}));
const githubTrending_1 = require("../app/modules/NewsIngestion/adapters/githubTrending");
const TRENDING_URL = 'https://github.com/trending';
const SEARCH_URL_PREFIX = 'https://api.github.com/search/repositories';
const trendingHtml = (repos) => repos
    .map((r) => {
    var _a;
    return `<article class="Box-row">
        <a href="/${r.path}">${r.path}</a>
        ${r.description ? `<p class="col-9 color-fg-muted my-1 pr-4">${r.description}</p>` : ''}
        <span>${(_a = r.stars) !== null && _a !== void 0 ? _a : 5} stars today</span>
      </article>`;
})
    .join('\n');
const htmlResponse = (html) => ({ ok: true, text: () => __awaiter(void 0, void 0, void 0, function* () { return html; }) });
const failedResponse = (status) => ({ ok: false, status, text: () => __awaiter(void 0, void 0, void 0, function* () { return ''; }), json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) });
const searchApiRepo = (fullName, overrides = {}) => {
    var _a, _b, _c;
    return ({
        full_name: fullName,
        html_url: `https://github.com/${fullName}`,
        description: (_a = overrides.description) !== null && _a !== void 0 ? _a : null,
        created_at: (_b = overrides.created_at) !== null && _b !== void 0 ? _b : new Date().toISOString(),
        stargazers_count: (_c = overrides.stars) !== null && _c !== void 0 ? _c : 10,
    });
};
const searchApiResponse = (repos) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ items: repos }); }) });
describe('enrichTitle', () => {
    it('appends the description when present', () => {
        expect((0, githubTrending_1.enrichTitle)('owner/repo', 'A cool project')).toBe('owner/repo — A cool project');
    });
    it('returns the bare full name when there is no description', () => {
        expect((0, githubTrending_1.enrichTitle)('owner/repo', undefined)).toBe('owner/repo');
        expect((0, githubTrending_1.enrichTitle)('owner/repo', null)).toBe('owner/repo');
    });
    it('truncates long descriptions at 200 characters with an ellipsis', () => {
        const long = 'x'.repeat(250);
        const result = (0, githubTrending_1.enrichTitle)('owner/repo', long);
        expect(result).toBe(`owner/repo — ${'x'.repeat(200)}…`);
    });
});
describe('fetchGithubTrending', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });
    it('throws when the scrape errors and the Search API also errors', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url === TRENDING_URL)
                return failedResponse(500);
            if (url.startsWith(SEARCH_URL_PREFIX))
                return failedResponse(503);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        yield expect((0, githubTrending_1.fetchGithubTrending)()).rejects.toThrow('both fetch paths yielded nothing');
    }));
    it('returns Search API items when the scrape parses to zero blocks', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url === TRENDING_URL)
                return htmlResponse('<html>no matching markup</html>');
            if (url.startsWith(SEARCH_URL_PREFIX))
                return searchApiResponse([searchApiRepo('new/repo')]);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        const items = yield (0, githubTrending_1.fetchGithubTrending)();
        expect(items).toHaveLength(1);
        expect(items[0].source_id).toBe('new/repo');
    }));
    it('returns scraped items when the Search API call fails', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url === TRENDING_URL)
                return htmlResponse(trendingHtml([{ path: 'owner/repo' }]));
            if (url.startsWith(SEARCH_URL_PREFIX))
                return failedResponse(500);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        const items = yield (0, githubTrending_1.fetchGithubTrending)();
        expect(items).toHaveLength(1);
        expect(items[0].source_id).toBe('owner/repo');
    }));
    it('deduplicates a repository appearing in both fetch paths, keeping the scrape entry', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url === TRENDING_URL)
                return htmlResponse(trendingHtml([{ path: 'owner/repo', description: 'from scrape' }]));
            if (url.startsWith(SEARCH_URL_PREFIX))
                return searchApiResponse([searchApiRepo('owner/repo', { description: 'from api' })]);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        const items = yield (0, githubTrending_1.fetchGithubTrending)();
        expect(items).toHaveLength(1);
        expect(items[0].snippet).toBe('from scrape');
    }));
    it('sets published_at from the Search API but leaves it undefined for scraped items', () => __awaiter(void 0, void 0, void 0, function* () {
        const createdAt = '2026-07-10T00:00:00.000Z';
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url === TRENDING_URL)
                return htmlResponse(trendingHtml([{ path: 'scraped/repo' }]));
            if (url.startsWith(SEARCH_URL_PREFIX))
                return searchApiResponse([searchApiRepo('api/repo', { created_at: createdAt })]);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        const items = yield (0, githubTrending_1.fetchGithubTrending)();
        const scraped = items.find((i) => i.source_id === 'scraped/repo');
        const fromApi = items.find((i) => i.source_id === 'api/repo');
        expect(scraped.published_at).toBeUndefined();
        expect(fromApi.published_at).toEqual(new Date(createdAt));
    }));
    it('resolves to an empty array when both paths legitimately find nothing', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url === TRENDING_URL)
                return htmlResponse('<html>nothing matches</html>');
            if (url.startsWith(SEARCH_URL_PREFIX))
                return searchApiResponse([]);
            throw new Error(`unexpected url: ${url}`);
        }));
        global.fetch = fetchMock;
        yield expect((0, githubTrending_1.fetchGithubTrending)()).resolves.toEqual([]);
    }));
});
