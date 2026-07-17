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
            mastodon_instances: ['mastodon.social', 'fosstodon.org'],
        },
    },
}));
const config_1 = __importDefault(require("../app/config"));
const mastodon_1 = require("../app/modules/NewsIngestion/adapters/mastodon");
const trendsResponse = (links) => ({ ok: true, json: () => __awaiter(void 0, void 0, void 0, function* () { return links; }) });
const failedResponse = (status) => ({ ok: false, status, json: () => __awaiter(void 0, void 0, void 0, function* () { return []; }) });
const link = (overrides = {}) => (Object.assign({ url: 'https://example.com/article', title: 'A trending article', description: undefined, history: [{ day: '1690000000', accounts: '10', uses: '15' }] }, overrides));
describe('fetchMastodon', () => {
    const originalFetch = global.fetch;
    const originalInstances = [...config_1.default.news_ingestion.mastodon_instances];
    afterEach(() => {
        global.fetch = originalFetch;
        config_1.default.news_ingestion.mastodon_instances = [...originalInstances];
    });
    it('coerces the string accounts count into raw_points and sets a fetch-time published_at', () => __awaiter(void 0, void 0, void 0, function* () {
        const before = Date.now();
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return url.includes('mastodon.social') ? trendsResponse([link({ history: [{ accounts: '57', uses: '80' }] })]) : trendsResponse([]); }));
        global.fetch = fetchMock;
        const items = yield (0, mastodon_1.fetchMastodon)();
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            source: 'mastodon',
            source_id: 'https://example.com/article',
            raw_points: 57,
            raw_comments: 0,
            raw_stars_delta: 0,
        });
        expect(items[0].published_at.getTime()).toBeGreaterThanOrEqual(before);
    }));
    it('dedupes the same URL trending on two instances, keeping the higher sharer count', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
            return url.includes('mastodon.social')
                ? trendsResponse([link({ history: [{ accounts: '40' }] })])
                : trendsResponse([link({ history: [{ accounts: '25' }] })]);
        }));
        global.fetch = fetchMock;
        const items = yield (0, mastodon_1.fetchMastodon)();
        expect(items).toHaveLength(1);
        expect(items[0].raw_points).toBe(40);
    }));
    it('returns the surviving instance items when one instance is down', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return url.includes('mastodon.social') ? failedResponse(500) : trendsResponse([link()]); }));
        global.fetch = fetchMock;
        const items = yield (0, mastodon_1.fetchMastodon)();
        expect(items).toHaveLength(1);
        expect(items[0].url).toBe('https://example.com/article');
    }));
    it('throws when every configured instance fails', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return failedResponse(500); }));
        global.fetch = fetchMock;
        yield expect((0, mastodon_1.fetchMastodon)()).rejects.toThrow('Mastodon: all instances failed');
    }));
    it('returns zero items without error when a small instance legitimately has no trends', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn(() => __awaiter(void 0, void 0, void 0, function* () { return trendsResponse([]); }));
        global.fetch = fetchMock;
        const items = yield (0, mastodon_1.fetchMastodon)();
        expect(items).toEqual([]);
    }));
    it('throws without making any network call when no instances are configured', () => __awaiter(void 0, void 0, void 0, function* () {
        config_1.default.news_ingestion.mastodon_instances = [];
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        yield expect((0, mastodon_1.fetchMastodon)()).rejects.toThrow('mastodon not configured');
        expect(fetchMock).not.toHaveBeenCalled();
    }));
    it('strips HTML from the description into the snippet', () => __awaiter(void 0, void 0, void 0, function* () {
        const fetchMock = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () { return url.includes('mastodon.social') ? trendsResponse([link({ description: '<p>Great <b>read</b></p>' })]) : trendsResponse([]); }));
        global.fetch = fetchMock;
        const items = yield (0, mastodon_1.fetchMastodon)();
        expect(items[0].snippet).toBe('Great read');
    }));
});
