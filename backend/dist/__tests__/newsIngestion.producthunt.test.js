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
            producthunt: { client_id: 'test-id', client_secret: 'test-secret' },
        },
    },
}));
const config_1 = __importDefault(require("../app/config"));
const redis_1 = require("../app/lib/redis");
const producthunt_1 = require("../app/modules/NewsIngestion/adapters/producthunt");
const tokenResponse = (token = `tok-${Math.random()}`) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ access_token: token }); }) });
const node = (overrides = {}) => (Object.assign({ id: 'p1', name: 'Acme', tagline: 'The best widget maker', url: 'https://producthunt.com/posts/acme', votesCount: 312, commentsCount: 41, createdAt: '2026-07-16T12:00:00.000Z' }, overrides));
const graphqlResponse = (nodes) => ({ ok: true, status: 200, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ data: { posts: { edges: nodes.map((n) => ({ node: n })) } } }); }) });
const graphqlEcho = (bodyCapture, nodes) => (_url, init) => __awaiter(void 0, void 0, void 0, function* () {
    if (init === null || init === void 0 ? void 0 : init.body)
        bodyCapture.query = JSON.parse(init.body).query;
    return graphqlResponse(nodes);
});
const graphqlErrorResponse = (message = 'Something went wrong') => ({ ok: true, status: 200, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ errors: [{ message }] }); }) });
const missingDataResponse = () => ({ ok: true, status: 200, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) });
const unauthorized = () => ({ ok: false, status: 401, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) });
const serverError = () => ({ ok: false, status: 500, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) });
describe('fetchProductHunt', () => {
    const originalFetch = global.fetch;
    const originalProducthunt = Object.assign({}, config_1.default.news_ingestion.producthunt);
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        yield redis_1.redis.flushall();
    }));
    afterEach(() => {
        global.fetch = originalFetch;
        config_1.default.news_ingestion.producthunt = Object.assign({}, originalProducthunt);
    });
    it('maps engagement and enriches the title with the tagline', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return (url.includes('oauth/token') ? tokenResponse() : graphqlResponse([node()])); }));
        global.fetch = fetchMock;
        const items = yield (0, producthunt_1.fetchProductHunt)();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            source: 'producthunt',
            source_id: 'p1',
            title: 'Acme — The best widget maker',
            raw_points: 312,
            raw_comments: 41,
            raw_stars_delta: 0,
            published_at: new Date('2026-07-16T12:00:00.000Z'),
        });
    }));
    it('requests the description field and maps it into content', () => __awaiter(void 0, void 0, void 0, function* () {
        const bodyCapture = {};
        const fetchMock = jest.fn((url, init) => __awaiter(void 0, void 0, void 0, function* () {
            return url.includes('oauth/token')
                ? tokenResponse()
                : graphqlEcho(bodyCapture, [node({ description: 'A longer description of Acme.' })])(url, init);
        }));
        global.fetch = fetchMock;
        const items = yield (0, producthunt_1.fetchProductHunt)();
        expect(bodyCapture.query).toContain('description');
        expect(items[0].content).toBe('A longer description of Acme.');
    }));
    it('leaves content undefined when a node has no description', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return (url.includes('oauth/token') ? tokenResponse() : graphqlResponse([node()])); }));
        global.fetch = fetchMock;
        const items = yield (0, producthunt_1.fetchProductHunt)();
        expect(items[0].content).toBeUndefined();
    }));
    it('caches the app token across two fetchProductHunt() calls', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return (url.includes('oauth/token') ? tokenResponse() : graphqlResponse([node()])); }));
        global.fetch = fetchMock;
        yield (0, producthunt_1.fetchProductHunt)();
        yield (0, producthunt_1.fetchProductHunt)();
        const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth/token'));
        expect(tokenCalls).toHaveLength(1);
    }));
    it('retries once with a fresh token after a 401', () => __awaiter(void 0, void 0, void 0, function* () {
        let graphqlAttempts = 0;
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url.includes('oauth/token'))
                return tokenResponse();
            graphqlAttempts += 1;
            return graphqlAttempts === 1 ? unauthorized() : graphqlResponse([node()]);
        }));
        global.fetch = fetchMock;
        const items = yield (0, producthunt_1.fetchProductHunt)();
        expect(items).toHaveLength(1);
        const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth/token'));
        expect(tokenCalls).toHaveLength(2); // initial token + refresh after the 401
    }));
    it('throws without emitting items when the GraphQL response carries an errors array', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return (url.includes('oauth/token') ? tokenResponse() : graphqlErrorResponse('rate limited')); }));
        global.fetch = fetchMock;
        yield expect((0, producthunt_1.fetchProductHunt)()).rejects.toThrow('rate limited');
    }));
    it('throws when data.posts is missing from an otherwise-200 response', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return (url.includes('oauth/token') ? tokenResponse() : missingDataResponse()); }));
        global.fetch = fetchMock;
        yield expect((0, producthunt_1.fetchProductHunt)()).rejects.toThrow('unexpected response shape');
    }));
    it('throws on a non-401 GraphQL failure without retrying', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return (url.includes('oauth/token') ? tokenResponse() : serverError()); }));
        global.fetch = fetchMock;
        yield expect((0, producthunt_1.fetchProductHunt)()).rejects.toThrow('Product Hunt GraphQL request failed: 500');
        const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth/token'));
        expect(tokenCalls).toHaveLength(1);
    }));
    it('makes no network calls when credentials are unconfigured', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.producthunt = { client_id: undefined, client_secret: undefined };
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        yield expect((0, producthunt_1.fetchProductHunt)()).rejects.toThrow('not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    }));
});
