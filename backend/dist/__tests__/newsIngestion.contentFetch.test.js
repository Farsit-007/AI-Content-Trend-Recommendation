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
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
jest.mock('../app/config', () => ({
    __esModule: true,
    default: {
        news_ingestion: {
            content_fetch: { enabled: true, timeout_ms: 200, concurrency: 2 },
            github_token: undefined,
        },
    },
}));
jest.mock('@extractus/article-extractor', () => ({
    extractFromHtml: jest.fn(),
}));
const article_extractor_1 = require("@extractus/article-extractor");
const config_1 = __importDefault(require("../app/config"));
const newsIngestion_contentFetch_1 = require("../app/modules/NewsIngestion/newsIngestion.contentFetch");
const mockedExtractFromHtml = article_extractor_1.extractFromHtml;
const articleFixture = (0, fs_1.readFileSync)(path_1.default.join(__dirname, 'fixtures', 'article.html'), 'utf-8');
describe('mapWithConcurrency', () => {
    it('returns results in input order regardless of completion order', () => __awaiter(void 0, void 0, void 0, function* () {
        const items = [50, 10, 30];
        const results = yield (0, newsIngestion_contentFetch_1.mapWithConcurrency)(items, 3, (ms) => __awaiter(void 0, void 0, void 0, function* () {
            yield new Promise((resolve) => setTimeout(resolve, ms));
            return ms;
        }));
        expect(results).toEqual([50, 10, 30]);
    }));
    it('never has more than `limit` items in flight at once', () => __awaiter(void 0, void 0, void 0, function* () {
        let inFlight = 0;
        let maxInFlight = 0;
        const items = Array.from({ length: 8 }, (_, i) => i);
        yield (0, newsIngestion_contentFetch_1.mapWithConcurrency)(items, 2, (i) => __awaiter(void 0, void 0, void 0, function* () {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            yield new Promise((resolve) => setTimeout(resolve, 5));
            inFlight -= 1;
            return i;
        }));
        expect(maxInFlight).toBeLessThanOrEqual(2);
    }));
    it('handles an empty array', () => __awaiter(void 0, void 0, void 0, function* () {
        const results = yield (0, newsIngestion_contentFetch_1.mapWithConcurrency)([], 3, (x) => __awaiter(void 0, void 0, void 0, function* () { return x; }));
        expect(results).toEqual([]);
    }));
});
describe('fetchDevToBody', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });
    it('returns body_markdown on a 200 response', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ body_markdown: 'Full article body.' }); }) }); }));
        yield expect((0, newsIngestion_contentFetch_1.fetchDevToBody)('123')).resolves.toBe('Full article body.');
    }));
    it('returns undefined on a non-200 response', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return ({ ok: false, status: 404 }); }));
        yield expect((0, newsIngestion_contentFetch_1.fetchDevToBody)('123')).resolves.toBeUndefined();
    }));
    it('returns undefined when body_markdown is missing from the response', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) }); }));
        yield expect((0, newsIngestion_contentFetch_1.fetchDevToBody)('123')).resolves.toBeUndefined();
    }));
});
describe('fetchGithubReadme', () => {
    const originalFetch = global.fetch;
    const originalToken = config_1.default.news_ingestion.github_token;
    afterEach(() => {
        global.fetch = originalFetch;
        config_1.default.news_ingestion.github_token = originalToken;
    });
    it('requests the readme endpoint for the given owner/repo', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((_url, _init) => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: true,
                text: () => __awaiter(void 0, void 0, void 0, function* () { return '# README'; }),
            });
        }));
        global.fetch = fetchMock;
        yield (0, newsIngestion_contentFetch_1.fetchGithubReadme)('facebook/react');
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/facebook/react/readme');
    }));
    it('omits the Authorization header when no GitHub token is configured', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((_url, _init) => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: true,
                text: () => __awaiter(void 0, void 0, void 0, function* () { return '# README'; }),
            });
        }));
        global.fetch = fetchMock;
        yield (0, newsIngestion_contentFetch_1.fetchGithubReadme)('facebook/react');
        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.Authorization).toBeUndefined();
    }));
    it('includes an Authorization header when a GitHub token is configured', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.github_token = 'test-token';
        const fetchMock = jest.fn((_url, _init) => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: true,
                text: () => __awaiter(void 0, void 0, void 0, function* () { return '# README'; }),
            });
        }));
        global.fetch = fetchMock;
        yield (0, newsIngestion_contentFetch_1.fetchGithubReadme)('facebook/react');
        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer test-token');
    }));
    it('returns undefined on a non-200 response', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return ({ ok: false, status: 404 }); }));
        yield expect((0, newsIngestion_contentFetch_1.fetchGithubReadme)('owner/repo')).resolves.toBeUndefined();
    }));
});
describe('extractFromUrl', () => {
    const originalFetch = global.fetch;
    const htmlResponse = (html, contentType = 'text/html; charset=utf-8') => ({
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
        text: () => __awaiter(void 0, void 0, void 0, function* () { return html; }),
    });
    afterEach(() => {
        global.fetch = originalFetch;
        mockedExtractFromHtml.mockReset();
    });
    it('extracts and strips text from a realistic article page', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return htmlResponse(articleFixture); }));
        mockedExtractFromHtml.mockResolvedValue({
            content: '<p>This is the opening paragraph.</p><p>This is the <b>second</b> paragraph.</p>',
        });
        const result = yield (0, newsIngestion_contentFetch_1.extractFromUrl)('https://example.test/article');
        expect(result).toBe('This is the opening paragraph.This is the second paragraph.');
    }));
    it('returns undefined for a non-2xx response', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: false,
                status: 404,
                headers: { get: () => null },
                text: () => __awaiter(void 0, void 0, void 0, function* () { return ''; }),
            });
        }));
        yield expect((0, newsIngestion_contentFetch_1.extractFromUrl)('https://example.test/missing')).resolves.toBeUndefined();
        expect(mockedExtractFromHtml).not.toHaveBeenCalled();
    }));
    it('returns undefined when the response content-type is not HTML', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return htmlResponse('{}', 'application/json'); }));
        yield expect((0, newsIngestion_contentFetch_1.extractFromUrl)('https://example.test/api')).resolves.toBeUndefined();
        expect(mockedExtractFromHtml).not.toHaveBeenCalled();
    }));
    it('returns undefined when the response body exceeds the size guard', () => __awaiter(void 0, void 0, void 0, function* () {
        const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return htmlResponse(oversized); }));
        yield expect((0, newsIngestion_contentFetch_1.extractFromUrl)('https://example.test/huge')).resolves.toBeUndefined();
        expect(mockedExtractFromHtml).not.toHaveBeenCalled();
    }));
    it('returns undefined when extraction yields no content', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return htmlResponse('<html><body></body></html>'); }));
        mockedExtractFromHtml.mockResolvedValue(null);
        yield expect((0, newsIngestion_contentFetch_1.extractFromUrl)('https://example.test/empty')).resolves.toBeUndefined();
    }));
    it('returns undefined when the request exceeds the configured timeout', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn((_url, opts) => new Promise((_resolve, reject) => {
            var _a;
            (_a = opts === null || opts === void 0 ? void 0 : opts.signal) === null || _a === void 0 ? void 0 : _a.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
            });
        }));
        yield expect((0, newsIngestion_contentFetch_1.extractFromUrl)('https://example.test/slow')).resolves.toBeUndefined();
    }));
});
describe('enrichContent', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
        mockedExtractFromHtml.mockReset();
    });
    it('passes an item with existing content through unchanged, making no fetch attempt', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        const item = { source: 'hackernews', source_id: '1', url: 'https://example.test/a', content: 'already here' };
        const { items, countsBySource } = yield (0, newsIngestion_contentFetch_1.enrichContent)([item]);
        expect(items[0].content).toBe('already here');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(countsBySource).toEqual({});
    }));
    it('routes a devto item to the dev.to article-by-id API', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            expect(url).toContain('dev.to/api/articles/');
            return { ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ body_markdown: 'Body text' }); }) };
        }));
        const { items, countsBySource } = yield (0, newsIngestion_contentFetch_1.enrichContent)([
            { source: 'devto', source_id: '99', url: 'https://dev.to/x' },
        ]);
        expect(items[0].content).toBe('Body text');
        expect(countsBySource.devto).toEqual({ fetched: 1, failed: 0 });
    }));
    it('routes a github_trending item to the GitHub README API', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            expect(url).toContain('/readme');
            return { ok: true, text: () => __awaiter(void 0, void 0, void 0, function* () { return '# README text'; }) };
        }));
        const { items, countsBySource } = yield (0, newsIngestion_contentFetch_1.enrichContent)([
            { source: 'github_trending', source_id: 'owner/repo', url: 'https://github.com/owner/repo' },
        ]);
        expect(items[0].content).toBe('# README text');
        expect(countsBySource.github_trending).toEqual({ fetched: 1, failed: 0 });
    }));
    it('routes any other source to generic page extraction', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: true,
                status: 200,
                headers: { get: () => 'text/html' },
                text: () => __awaiter(void 0, void 0, void 0, function* () { return '<html><body><article>Content</article></body></html>'; }),
            });
        }));
        mockedExtractFromHtml.mockResolvedValue({ content: 'Extracted content.' });
        const { items, countsBySource } = yield (0, newsIngestion_contentFetch_1.enrichContent)([
            { source: 'mastodon', source_id: 'x', url: 'https://example.test/y' },
        ]);
        expect(items[0].content).toBe('Extracted content.');
        expect(countsBySource.mastodon).toEqual({ fetched: 1, failed: 0 });
    }));
    it('marks content_status failed and increments the failed count when nothing is found', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: false,
                status: 500,
                headers: { get: () => null },
                text: () => __awaiter(void 0, void 0, void 0, function* () { return ''; }),
            });
        }));
        const { items, countsBySource } = yield (0, newsIngestion_contentFetch_1.enrichContent)([
            { source: 'mastodon', source_id: 'x', url: 'https://example.test/y' },
        ]);
        expect(items[0].content).toBeUndefined();
        expect(items[0].content_status).toBe('failed');
        expect(countsBySource.mastodon).toEqual({ fetched: 0, failed: 1 });
    }));
});
