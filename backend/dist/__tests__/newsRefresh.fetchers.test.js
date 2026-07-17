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
            reddit: { client_id: 'test-id', client_secret: 'test-secret', user_agent: 'test-agent' },
        },
    },
}));
jest.mock('../app/modules/NewsIngestion/adapters/reddit', () => ({
    __esModule: true,
    getAppToken: jest.fn().mockResolvedValue('test-token'),
}));
const config_1 = __importDefault(require("../app/config"));
const newsRefresh_fetchers_1 = require("../app/modules/NewsRefresh/newsRefresh.fetchers");
describe('REFRESHABLE_SOURCES', () => {
    it('registers exactly hackernews, reddit, devto', () => {
        expect([...newsRefresh_fetchers_1.REFRESHABLE_SOURCES].sort()).toEqual(['devto', 'hackernews', 'reddit']);
    });
});
describe('reddit engagement fetcher', () => {
    const originalFetch = global.fetch;
    const originalReddit = Object.assign({}, config_1.default.news_ingestion.reddit);
    afterEach(() => {
        global.fetch = originalFetch;
        config_1.default.news_ingestion.reddit = Object.assign({}, originalReddit);
    });
    it('batches 150 items into two requests of at most 100 t3_-prefixed fullnames each', () => __awaiter(void 0, void 0, void 0, function* () {
        const items = Array.from({ length: 150 }, (_, i) => ({ source_id: `p${i}` }));
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: true,
                json: () => __awaiter(void 0, void 0, void 0, function* () {
                    return ({
                        data: {
                            children: new URL(url).searchParams
                                .get('id')
                                .split(',')
                                .map((fullname) => ({ data: { name: fullname, ups: 10, num_comments: 2 } })),
                        },
                    });
                }),
            });
        }));
        global.fetch = fetchMock;
        const { results, requestsUsed } = yield newsRefresh_fetchers_1.ENGAGEMENT_FETCHERS.reddit(items);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestsUsed).toBe(2);
        const firstCallUrl = new URL(String(fetchMock.mock.calls[0][0]));
        const firstCallIds = firstCallUrl.searchParams.get('id').split(',');
        expect(firstCallIds).toHaveLength(100);
        expect(firstCallIds[0]).toBe('t3_p0');
        expect(results).toHaveLength(150);
    }));
    it('maps results back to items by data.name, never by response order', () => __awaiter(void 0, void 0, void 0, function* () {
        const items = [{ source_id: 'a' }, { source_id: 'b' }];
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: true,
                json: () => __awaiter(void 0, void 0, void 0, function* () {
                    return ({
                        data: {
                            children: [
                                { data: { name: 't3_b', ups: 99, num_comments: 1 } },
                                { data: { name: 't3_a', ups: 1, num_comments: 0 } },
                            ],
                        },
                    });
                }),
            });
        }));
        const { results } = yield newsRefresh_fetchers_1.ENGAGEMENT_FETCHERS.reddit(items);
        expect(results.find((r) => r.source_id === 'a')).toMatchObject({ points: 1, comments: 0, removed: false });
        expect(results.find((r) => r.source_id === 'b')).toMatchObject({ points: 99, comments: 1, removed: false });
    }));
    it('marks an item missing from the listing response as removed', () => __awaiter(void 0, void 0, void 0, function* () {
        global.fetch = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                ok: true,
                json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ data: { children: [] } }); }),
            });
        }));
        const { results } = yield newsRefresh_fetchers_1.ENGAGEMENT_FETCHERS.reddit([{ source_id: 'gone' }]);
        expect(results).toEqual([{ source_id: 'gone', points: 0, comments: 0, stars_delta: 0, removed: true }]);
    }));
    it('skips entirely and makes no request when credentials are unconfigured', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.reddit = { client_id: undefined, client_secret: undefined, user_agent: 'test-agent' };
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        const { results, requestsUsed } = yield newsRefresh_fetchers_1.ENGAGEMENT_FETCHERS.reddit([{ source_id: 'x' }]);
        expect(results).toEqual([]);
        expect(requestsUsed).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    }));
});
