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
            stackexchange_key: undefined,
        },
    },
}));
const config_1 = __importDefault(require("../app/config"));
const stackoverflow_1 = require("../app/modules/NewsIngestion/adapters/stackoverflow");
const questionsResponse = (items, extra = {}) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return (Object.assign({ items }, extra)); }) });
const errorResponse = (error_message, status = 400) => ({ ok: false, status, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ error_id: 400, error_message }); }) });
const question = (overrides = {}) => (Object.assign({ question_id: 42, title: 'Why doesn&#39;t useEffect fire?', link: 'https://stackoverflow.com/questions/42/why-doesnt-useeffect-fire', tags: ['javascript', 'react', 'hooks'], creation_date: 1752600000, score: 18, answer_count: 4 }, overrides));
describe('fetchStackOverflow', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
        config_1.default.news_ingestion.stackexchange_key = undefined;
    });
    it('decodes HTML entities in the title and maps engagement', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return questionsResponse([question()]); }));
        global.fetch = fetchMock;
        const items = yield (0, stackoverflow_1.fetchStackOverflow)();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            source: 'stackoverflow',
            source_id: '42',
            title: "Why doesn't useEffect fire?",
            snippet: 'javascript, react, hooks',
            raw_points: 18,
            raw_comments: 4,
            raw_stars_delta: 0,
            published_at: new Date(1752600000 * 1000),
        });
    }));
    it('requests without a key parameter when STACKEXCHANGE_KEY is unset', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            expect(url).not.toContain('&key=');
            return questionsResponse([question()]);
        }));
        global.fetch = fetchMock;
        yield (0, stackoverflow_1.fetchStackOverflow)();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    }));
    it('appends the key parameter when STACKEXCHANGE_KEY is configured', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.stackexchange_key = 'test-key';
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            expect(url).toContain('&key=test-key');
            return questionsResponse([question()]);
        }));
        global.fetch = fetchMock;
        yield (0, stackoverflow_1.fetchStackOverflow)();
    }));
    it('throws with the API error message on an error_id/error_message response', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return errorResponse('access_token expired'); }));
        global.fetch = fetchMock;
        yield expect((0, stackoverflow_1.fetchStackOverflow)()).rejects.toThrow('access_token expired');
    }));
    it('throws when items is missing or not an array', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) }); }));
        global.fetch = fetchMock;
        yield expect((0, stackoverflow_1.fetchStackOverflow)()).rejects.toThrow('Stack Exchange request failed');
    }));
    it('logs a warning but does not throw or delay when the response carries a backoff field', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return questionsResponse([question()], { backoff: 10 }); }));
        global.fetch = fetchMock;
        const start = Date.now();
        const items = yield (0, stackoverflow_1.fetchStackOverflow)();
        expect(items).toHaveLength(1);
        expect(Date.now() - start).toBeLessThan(1000);
    }));
});
