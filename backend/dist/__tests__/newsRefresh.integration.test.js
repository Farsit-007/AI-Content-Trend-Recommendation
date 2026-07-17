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
const config_1 = __importDefault(require("../app/config"));
const redis_1 = require("../app/lib/redis");
const maintenanceRun_model_1 = require("../app/modules/MaintenanceRun/maintenanceRun.model");
const newsItem_model_1 = require("../app/modules/NewsItem/newsItem.model");
const newsRefresh_service_1 = require("../app/modules/NewsRefresh/newsRefresh.service");
const db_1 = require("./support/db");
const fixtures_1 = require("./support/fixtures");
beforeAll(db_1.connectTestDb);
afterEach(() => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.clearTestDb)();
    yield redis_1.redis.flushall();
}));
afterAll(db_1.disconnectTestDb);
const seedNewsItem = (overrides = {}) => newsItem_model_1.NewsItem.create(Object.assign({ source: 'hackernews', source_id: 'hn1', content_hash: `hash-${Math.random()}`, title: 'Test story', url: `https://example.test/${Math.random()}`, embedding: (0, fixtures_1.testEmbedding)(), engagement: { points: 1, comments: 1, stars_delta: 0 }, trend_score: 1, needs_review: false, processed: true, created_at: new Date() }, overrides));
const mockFetchByUrl = (handlers) => {
    global.fetch = jest.fn((url) => __awaiter(void 0, void 0, void 0, function* () {
        for (const [match, handler] of Object.entries(handlers)) {
            if (url.includes(match))
                return typeof handler === 'function' ? handler() : handler;
        }
        throw new Error(`Unmocked fetch call: ${url}`);
    }));
};
const okJson = (body) => ({ ok: true, status: 200, json: () => __awaiter(void 0, void 0, void 0, function* () { return body; }) });
const notFound = () => ({ ok: false, status: 404, json: () => __awaiter(void 0, void 0, void 0, function* () { return ({}); }) });
describe('runEngagementRefresh', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });
    it('refreshes engagement, appends history (with an ingest-time first snapshot), and sets engagement_refreshed_at', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const item = yield seedNewsItem({ source: 'hackernews', source_id: 'hn1', engagement: { points: 1, comments: 1, stars_delta: 0 } });
        mockFetchByUrl({ 'hacker-news.firebaseio.com': okJson({ score: 50, descendants: 10 }) });
        yield (0, newsRefresh_service_1.runEngagementRefresh)();
        const refreshed = yield newsItem_model_1.NewsItem.findById(item._id).lean();
        expect(refreshed === null || refreshed === void 0 ? void 0 : refreshed.engagement).toMatchObject({ points: 50, comments: 10, stars_delta: 0 });
        expect(refreshed === null || refreshed === void 0 ? void 0 : refreshed.engagement_refreshed_at).toBeInstanceOf(Date);
        expect(refreshed === null || refreshed === void 0 ? void 0 : refreshed.engagement_history).toHaveLength(2);
        expect((_a = refreshed === null || refreshed === void 0 ? void 0 : refreshed.engagement_history) === null || _a === void 0 ? void 0 : _a[0]).toMatchObject({ points: 1, comments: 1 });
        expect((_b = refreshed === null || refreshed === void 0 ? void 0 : refreshed.engagement_history) === null || _b === void 0 ? void 0 : _b[1]).toMatchObject({ points: 50, comments: 10 });
    }));
    it('sets source_removed on a 404 and does not delete the item, and still recomputes current_trend_score', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield seedNewsItem({ source: 'devto', source_id: 'dev-gone', engagement: { points: 5, comments: 2, stars_delta: 0 } });
        mockFetchByUrl({ 'dev.to/api/articles': notFound() });
        yield (0, newsRefresh_service_1.runEngagementRefresh)();
        const refreshed = yield newsItem_model_1.NewsItem.findById(item._id).lean();
        expect(refreshed).not.toBeNull();
        expect(refreshed === null || refreshed === void 0 ? void 0 : refreshed.source_removed).toBe(true);
        expect(refreshed === null || refreshed === void 0 ? void 0 : refreshed.current_trend_score).toBeDefined();
    }));
    it('current_trend_score strictly decreases across two refresh cycles with static (unchanging) engagement', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield seedNewsItem({ source: 'hackernews', source_id: 'hn1', engagement: { points: 10, comments: 5, stars_delta: 0 } });
        mockFetchByUrl({ 'hacker-news.firebaseio.com': okJson({ score: 10, descendants: 5 }) });
        jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
        try {
            jest.setSystemTime(new Date());
            yield (0, newsRefresh_service_1.runEngagementRefresh)();
            const afterFirst = yield newsItem_model_1.NewsItem.findById(item._id).lean();
            yield redis_1.redis.flushall(); // release the lock explicitly rather than relying on mocked TTL expiry
            jest.setSystemTime(new Date(Date.now() + 5 * 60 * 60 * 1000));
            yield (0, newsRefresh_service_1.runEngagementRefresh)();
            const afterSecond = yield newsItem_model_1.NewsItem.findById(item._id).lean();
            expect(afterSecond === null || afterSecond === void 0 ? void 0 : afterSecond.current_trend_score).toBeLessThan(afterFirst === null || afterFirst === void 0 ? void 0 : afterFirst.current_trend_score);
        }
        finally {
            jest.useRealTimers();
        }
    }));
    it('backfills current_trend_score for out-of-window rows lacking it, leaving already-set rows untouched', () => __awaiter(void 0, void 0, void 0, function* () {
        const outsideWindow = new Date(Date.now() - (config_1.default.news_ingestion.refresh.window_hours + 10) * 60 * 60 * 1000);
        const unscored = yield seedNewsItem({
            source: 'hackernews',
            source_id: 'old-unscored',
            trend_score: 3.5,
            created_at: outsideWindow,
        });
        const alreadyScored = yield seedNewsItem({
            source: 'hackernews',
            source_id: 'old-already-scored',
            content_hash: `hash-${Math.random()}`,
            trend_score: 3.5,
            current_trend_score: 9.9,
            created_at: outsideWindow,
        });
        yield (0, newsRefresh_service_1.runEngagementRefresh)(); // neither item is a refresh candidate (both outside the window) — no fetch needed
        const backfilled = yield newsItem_model_1.NewsItem.findById(unscored._id).lean();
        const untouched = yield newsItem_model_1.NewsItem.findById(alreadyScored._id).lean();
        expect(backfilled === null || backfilled === void 0 ? void 0 : backfilled.current_trend_score).toBe(3.5);
        expect(untouched === null || untouched === void 0 ? void 0 : untouched.current_trend_score).toBe(9.9);
    }));
    it('caps engagement_history at the most recent 32 snapshots', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const existingHistory = Array.from({ length: 32 }, (_, i) => ({
            at: new Date(Date.now() - i * 60 * 60 * 1000),
            points: i,
            comments: i,
            stars_delta: 0,
        }));
        const item = yield seedNewsItem({ source: 'devto', source_id: 'dev-old', engagement_history: existingHistory });
        mockFetchByUrl({ 'dev.to/api/articles': okJson({ public_reactions_count: 999, comments_count: 1 }) });
        yield (0, newsRefresh_service_1.runEngagementRefresh)();
        const refreshed = yield newsItem_model_1.NewsItem.findById(item._id).lean();
        expect(refreshed === null || refreshed === void 0 ? void 0 : refreshed.engagement_history).toHaveLength(32);
        expect((_a = refreshed === null || refreshed === void 0 ? void 0 : refreshed.engagement_history) === null || _a === void 0 ? void 0 : _a[31]).toMatchObject({ points: 999, comments: 1 });
    }));
    it('persists a maintenance_runs document with consistent counts', () => __awaiter(void 0, void 0, void 0, function* () {
        yield seedNewsItem({ source: 'hackernews', source_id: 'hn1' });
        yield seedNewsItem({ source: 'devto', source_id: 'dev-gone', content_hash: `hash-${Math.random()}` });
        mockFetchByUrl({
            'hacker-news.firebaseio.com': okJson({ score: 5, descendants: 1 }),
            'dev.to/api/articles': notFound(),
        });
        yield (0, newsRefresh_service_1.runEngagementRefresh)();
        const runs = yield maintenanceRun_model_1.MaintenanceRun.find({ job: 'engagement_refresh' }).lean();
        expect(runs).toHaveLength(1);
        expect(runs[0].counts).toMatchObject({ candidates: 2, refreshed: 1, source_removed: 1 });
    }));
    it('exits without fetching or writing anything when the lock is already held', () => __awaiter(void 0, void 0, void 0, function* () {
        const item = yield seedNewsItem({ source: 'hackernews', source_id: 'hn1' });
        yield redis_1.redis.set('lock:news_refresh', 'held-by-another-run', 'PX', 60000, 'NX');
        const fetchMock = jest.fn();
        global.fetch = fetchMock;
        yield (0, newsRefresh_service_1.runEngagementRefresh)();
        expect(fetchMock).not.toHaveBeenCalled();
        const unchanged = yield newsItem_model_1.NewsItem.findById(item._id).lean();
        expect(unchanged === null || unchanged === void 0 ? void 0 : unchanged.engagement_refreshed_at).toBeUndefined();
        expect(yield maintenanceRun_model_1.MaintenanceRun.countDocuments({ job: 'engagement_refresh' })).toBe(0);
    }));
});
