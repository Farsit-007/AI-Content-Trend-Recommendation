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
const hackerNews_1 = require("../app/modules/NewsIngestion/adapters/hackerNews");
const newsIngestion_utils_1 = require("../app/modules/NewsIngestion/newsIngestion.utils");
const jsonResponse = (hits) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ hits }); }) });
const failedResponse = (status) => ({ ok: false, status, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ hits: [] }); }) });
const hit = (overrides = {}) => (Object.assign({ objectID: '12345', title: 'A great story', url: 'https://example.com/article', points: 100, num_comments: 20, created_at_i: 1752742800, story_text: undefined }, overrides));
/** URLs are requested in Promise.all order: front page first, risers second. */
const mockFetchSequence = (frontPage, risers) => {
    const fetchMock = jest.fn().mockResolvedValueOnce(frontPage).mockResolvedValueOnce(risers);
    global.fetch = fetchMock;
    return fetchMock;
};
describe('fetchHackerNews', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });
    it('maps engagement signals and timestamps onto the emitted item', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(jsonResponse([hit({ points: 312, num_comments: 41 })]), jsonResponse([]));
        const items = yield (0, hackerNews_1.fetchHackerNews)();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            source: 'hackernews',
            source_id: '12345',
            raw_points: 312,
            raw_comments: 41,
            raw_stars_delta: 0,
            published_at: new Date(1752742800 * 1000),
        });
    }));
    it('dedupes a story present in both the front page and risers, keeping the front-page copy', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(jsonResponse([hit({ objectID: '999', points: 500 })]), jsonResponse([hit({ objectID: '999', points: 1 })]));
        const items = yield (0, hackerNews_1.fetchHackerNews)();
        expect(items).toHaveLength(1);
        expect(items[0].raw_points).toBe(500);
    }));
    it('falls back to the HN item page URL for stories without a url field', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(jsonResponse([hit({ objectID: '777', url: undefined })]), jsonResponse([]));
        const items = yield (0, hackerNews_1.fetchHackerNews)();
        expect(items[0].url).toBe('https://news.ycombinator.com/item?id=777');
    }));
    it('returns the surviving call results when only one Algolia request fails', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(failedResponse(500), jsonResponse([hit({ objectID: '111' })]));
        const items = yield (0, hackerNews_1.fetchHackerNews)();
        expect(items).toHaveLength(1);
        expect(items[0].source_id).toBe('111');
    }));
    it('throws when both Algolia requests fail', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(failedResponse(500), failedResponse(500));
        yield expect((0, hackerNews_1.fetchHackerNews)()).rejects.toThrow('HackerNews (Algolia) request failed: both front-page and risers requests failed');
    }));
    it('strips HTML from story_text into the snippet', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(jsonResponse([hit({ story_text: '<p>Ask HN: <b>why?</b></p>' })]), jsonResponse([]));
        const items = yield (0, hackerNews_1.fetchHackerNews)();
        expect(items[0].snippet).toBe('Ask HN: why?');
    }));
    it('also maps the stripped story_text into content for text posts', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(jsonResponse([hit({ story_text: '<p>Ask HN: <b>why?</b></p>' })]), jsonResponse([]));
        const items = yield (0, hackerNews_1.fetchHackerNews)();
        expect(items[0].content).toBe('Ask HN: why?');
    }));
    it('leaves content undefined for link posts with no story_text', () => __awaiter(void 0, void 0, void 0, function* () {
        mockFetchSequence(jsonResponse([hit({ story_text: undefined })]), jsonResponse([]));
        const items = yield (0, hackerNews_1.fetchHackerNews)();
        expect(items[0].content).toBeUndefined();
    }));
    describe('content_hash compatibility with the previous Firebase adapter', () => {
        /** Reproduces the old Firebase adapter's URL-derivation rule exactly, for comparison. */
        const oldAdapterUrl = (item) => { var _a; return (_a = item.url) !== null && _a !== void 0 ? _a : `https://news.ycombinator.com/item?id=${item.id}`; };
        it('produces an identical hash for a story with an external url', () => __awaiter(void 0, void 0, void 0, function* () {
            mockFetchSequence(jsonResponse([hit({ objectID: '42', url: 'https://example.com/piece' })]), jsonResponse([]));
            const [item] = yield (0, hackerNews_1.fetchHackerNews)();
            const oldHash = (0, newsIngestion_utils_1.computeContentHash)('hackernews', oldAdapterUrl({ url: 'https://example.com/piece', id: 42 }));
            expect((0, newsIngestion_utils_1.computeContentHash)(item.source, item.url)).toBe(oldHash);
        }));
        it('produces an identical hash for a url-less (Ask HN style) story', () => __awaiter(void 0, void 0, void 0, function* () {
            mockFetchSequence(jsonResponse([hit({ objectID: '43', url: undefined })]), jsonResponse([]));
            const [item] = yield (0, hackerNews_1.fetchHackerNews)();
            const oldHash = (0, newsIngestion_utils_1.computeContentHash)('hackernews', oldAdapterUrl({ url: undefined, id: 43 }));
            expect((0, newsIngestion_utils_1.computeContentHash)(item.source, item.url)).toBe(oldHash);
        }));
    });
});
