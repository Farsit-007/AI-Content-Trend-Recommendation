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
jest.mock('../app/config', () => ({
    __esModule: true,
    default: {
        news_ingestion: {
            gnews: { api_key: 'test-key', queries: ['AI regulation'] },
        },
    },
}));
const config_1 = __importDefault(require("../app/config"));
const gnews_1 = require("../app/modules/NewsIngestion/adapters/gnews");
const searchResponse = (articles) => ({ ok: true, status: 200, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ articles }); }) });
const errorResponse = (errors, status = 403) => ({ ok: false, status, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ errors }); }) });
const article = (overrides = {}) => (Object.assign({ title: 'AI regulation bill passes', description: 'A summary of the bill', url: 'https://www.example-news.com/article', publishedAt: '2026-07-16T12:00:00Z' }, overrides));
describe('fetchGNews', () => {
    const originalFetch = global.fetch;
    const originalGnews = Object.assign({}, config_1.default.news_ingestion.gnews);
    afterEach(() => {
        global.fetch = originalFetch;
        config_1.default.news_ingestion.gnews = Object.assign(Object.assign({}, originalGnews), { queries: [...originalGnews.queries] });
    });
    it('maps the article using the API-provided url directly, with no canonicalization', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return searchResponse([article()]); }));
        global.fetch = fetchMock;
        const items = yield (0, gnews_1.fetchGNews)();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            source: 'gnews',
            source_id: 'https://www.example-news.com/article',
            url: 'https://www.example-news.com/article',
            title: 'AI regulation bill passes',
            snippet: 'A summary of the bill',
            raw_points: 0,
            raw_comments: 0,
            raw_stars_delta: 0,
            published_at: new Date('2026-07-16T12:00:00Z'),
        });
    }));
    it('slices the query list to 3 topics', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.gnews.queries = ['a', 'b', 'c', 'd', 'e'];
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return searchResponse([]); }));
        global.fetch = fetchMock;
        yield (0, gnews_1.fetchGNews)();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    }));
    it('makes no network calls when the API key is unset', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.gnews.api_key = undefined;
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        yield expect((0, gnews_1.fetchGNews)()).rejects.toThrow('not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    }));
    it('makes no network calls when no topics are configured', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.gnews.queries = [];
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        yield expect((0, gnews_1.fetchGNews)()).rejects.toThrow('not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    }));
    it('returns the surviving query results when one query fails', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.gnews.queries = ['broken', 'good'];
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return url.includes('q=broken') ? errorResponse(['quota exceeded']) : searchResponse([article()]); }));
        global.fetch = fetchMock;
        const items = yield (0, gnews_1.fetchGNews)();
        expect(items).toHaveLength(1);
    }));
    it('throws surfacing the errors body when every query fails', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return errorResponse(['invalid api key']); }));
        global.fetch = fetchMock;
        yield expect((0, gnews_1.fetchGNews)()).rejects.toThrow('invalid api key');
    }));
});
