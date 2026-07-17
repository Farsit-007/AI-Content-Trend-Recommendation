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
// Injects a hypothetical future registry entry alongside the real sources, so the "no drift"
// assertion below also covers a source that doesn't exist in the codebase yet.
jest.mock('../app/modules/NewsRefresh/newsRefresh.fetchers', () => ({
    __esModule: true,
    REFRESHABLE_SOURCES: ['hackernews', 'reddit', 'devto', 'fake_future_source'],
    ENGAGEMENT_FETCHERS: {},
}));
const newsIngestion_scoring_1 = require("../app/modules/NewsIngestion/newsIngestion.scoring");
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const newsRetention_service_1 = require("../app/modules/NewsRetention/newsRetention.service");
const db_1 = require("./support/db");
const fixtures_1 = require("./support/fixtures");
beforeAll(db_1.connectTestDb);
afterEach(db_1.clearTestDb);
afterAll(db_1.disconnectTestDb);
const seedNewsItem = (source, engagement) => newsItem_model_1.NewsItem.create({
    source,
    source_id: `id-${Math.random()}`,
    content_hash: `hash-${Math.random()}`,
    title: 'Test item',
    url: `https://example.test/${Math.random()}`,
    embedding: (0, fixtures_1.testEmbedding)(),
    engagement,
    needs_review: false,
    processed: true,
});
describe('newsRetention engagementSignalClause vs. hasEngagementSignal', () => {
    it.each([
        ['registry source, zero engagement', 'hackernews', { points: 0, comments: 0, stars_delta: 0 }],
        ['non-registry source, nonzero points', 'rss:example.com', { points: 5, comments: 0, stars_delta: 0 }],
        ['non-registry source, nonzero comments', 'rss:example.com', { points: 0, comments: 3, stars_delta: 0 }],
        ['non-registry source, nonzero stars', 'github_trending', { points: 0, comments: 0, stars_delta: 2 }],
        ['non-registry source, zero engagement', 'rss:example.com', { points: 0, comments: 0, stars_delta: 0 }],
        ['a hypothetical future registry entry, zero engagement', 'fake_future_source', { points: 0, comments: 0, stars_delta: 0 }],
    ])('%s: Mongo predicate agrees with the pure function', (_label, source, engagement) => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield seedNewsItem(source, engagement);
        const jsResult = (0, newsIngestion_scoring_1.hasEngagementSignal)({ source, engagement });
        const mongoMatch = yield newsItem_model_1.NewsItem.exists(Object.assign({ _id: item._id }, newsRetention_service_1.engagementSignalClause));
        expect(Boolean(mongoMatch)).toBe(jsResult);
    }));
});
