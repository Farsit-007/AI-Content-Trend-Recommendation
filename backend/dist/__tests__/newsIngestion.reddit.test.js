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
            reddit_subreddits: ['programming', 'technology'],
            reddit: { client_id: 'test-id', client_secret: 'test-secret', user_agent: 'test-agent' },
        },
    },
}));
const config_1 = __importDefault(require("../app/config"));
const redis_1 = require("../app/lib/redis");
const reddit_1 = require("../app/modules/NewsIngestion/adapters/reddit");
const tokenResponse = (token = `tok-${Math.random()}`, expires_in = 3600) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ access_token: token, expires_in }); }) });
const listingResponse = (subreddit, postIds = ['p1'], overrides = {}) => ({
    ok: true,
    status: 200,
    json: () => __awaiter(void 0, void 0, void 0, function* () {
        return ({
            data: {
                children: postIds.map((id) => ({
                    data: Object.assign({ id, title: `${subreddit} post ${id}`, permalink: `/r/${subreddit}/${id}` }, overrides),
                })),
            },
        });
    }),
});
const unauthorized = () => ({ ok: false, status: 401, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) });
const serverError = () => ({ ok: false, status: 500, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) });
describe('fetchReddit', () => {
    const originalFetch = global.fetch;
    const originalReddit = Object.assign({}, config_1.default.news_ingestion.reddit);
    const originalSubreddits = [...config_1.default.news_ingestion.reddit_subreddits];
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        yield redis_1.redis.flushall();
    }));
    afterEach(() => {
        global.fetch = originalFetch;
        config_1.default.news_ingestion.reddit = Object.assign({}, originalReddit);
        config_1.default.news_ingestion.reddit_subreddits = [...originalSubreddits];
    });
    it('caches the app token across two fetchReddit() calls', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url.includes('access_token'))
                return tokenResponse();
            const subreddit = url.includes('/r/programming/') ? 'programming' : 'technology';
            return listingResponse(subreddit);
        }));
        global.fetch = fetchMock;
        yield (0, reddit_1.fetchReddit)();
        yield (0, reddit_1.fetchReddit)();
        const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('access_token'));
        expect(tokenCalls).toHaveLength(1);
    }));
    it('retries once with a fresh token after a 401', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.reddit_subreddits = ['programming'];
        let listingAttempts = 0;
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url.includes('access_token'))
                return tokenResponse();
            listingAttempts += 1;
            return listingAttempts === 1 ? unauthorized() : listingResponse('programming');
        }));
        global.fetch = fetchMock;
        const items = yield (0, reddit_1.fetchReddit)();
        expect(items).toHaveLength(1);
        const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('access_token'));
        expect(tokenCalls).toHaveLength(2); // initial token + refresh after the 401
    }));
    it('makes no network calls when credentials are unconfigured', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.reddit = { client_id: undefined, client_secret: undefined, user_agent: 'test-agent' };
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        yield expect((0, reddit_1.fetchReddit)()).rejects.toThrow('not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    }));
    it('stores the full selftext as content while snippet stays sliced to 500 characters', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.reddit_subreddits = ['programming'];
        const longText = 'x'.repeat(600);
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url.includes('access_token'))
                return tokenResponse();
            return listingResponse('programming', ['p1'], { selftext: longText });
        }));
        global.fetch = fetchMock;
        const items = yield (0, reddit_1.fetchReddit)();
        expect(items).toHaveLength(1);
        expect(items[0].snippet).toHaveLength(500);
        expect(items[0].content).toBe(longText);
        expect(items[0].content).toHaveLength(600);
    }));
    it('returns items from the other subreddits when one fails', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            if (url.includes('access_token'))
                return tokenResponse();
            if (url.includes('/r/technology/'))
                return serverError();
            return listingResponse('programming');
        }));
        global.fetch = fetchMock;
        const items = yield (0, reddit_1.fetchReddit)();
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('programming post p1');
    }));
});
