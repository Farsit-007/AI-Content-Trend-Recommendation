"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const newsIngestion_scoring_1 = require("../app/modules/NewsIngestion/newsIngestion.scoring");
const now = new Date('2026-01-02T00:00:00Z');
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);
describe('computeCurrentTrendScore', () => {
    it('decays monotonically with age (same engagement, older item scores lower)', () => {
        const engagement = { points: 100, comments: 10, stars_delta: 0 };
        const young = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at: hoursAgo(1) }, now);
        const old = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at: hoursAgo(48) }, now);
        expect(old).toBeLessThan(young);
    });
    it('adds a positive bonus when the last two history snapshots show rising engagement', () => {
        const created_at = hoursAgo(2);
        const engagement = { points: 100, comments: 0, stars_delta: 0 };
        const risingHistory = [
            { at: hoursAgo(2), points: 10, comments: 0, stars_delta: 0 },
            { at: hoursAgo(1), points: 100, comments: 0, stars_delta: 0 },
        ];
        const withVelocity = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at, engagement_history: risingHistory }, now);
        const withoutVelocity = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at }, now);
        expect(withVelocity).toBeGreaterThan(withoutVelocity);
    });
    it('velocity is 0 with fewer than two history snapshots', () => {
        const created_at = hoursAgo(2);
        const engagement = { points: 100, comments: 0, stars_delta: 0 };
        const oneSnapshot = [{ at: hoursAgo(1), points: 100, comments: 0, stars_delta: 0 }];
        const withOne = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at, engagement_history: oneSnapshot }, now);
        const withNone = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at }, now);
        expect(withOne).toBe(withNone);
    });
    it('clamps to [0, 10] even with extreme engagement and a large velocity bonus', () => {
        const engagement = { points: 1000000, comments: 1000000, stars_delta: 1000000 };
        const history = [
            { at: hoursAgo(1), points: 0, comments: 0, stars_delta: 0 },
            { at: now, points: 1000000, comments: 1000000, stars_delta: 1000000 },
        ];
        const score = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at: hoursAgo(1), engagement_history: history }, now);
        expect(score).toBeLessThanOrEqual(10);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(score * 10)).toBe(true);
    });
    it('scores zero-engagement items at exactly 0', () => {
        const score = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement: { points: 0, comments: 0, stars_delta: 0 }, created_at: now }, now);
        expect(score).toBe(0);
    });
    it('falls back to created_at when published_at is missing, and prefers published_at when present', () => {
        const engagement = { points: 100, comments: 0, stars_delta: 0 };
        const created_at = hoursAgo(48);
        const withoutPublished = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at }, now);
        const withRecentPublished = (0, newsIngestion_scoring_1.computeCurrentTrendScore)({ engagement, created_at, published_at: hoursAgo(1) }, now);
        expect(withRecentPublished).toBeGreaterThan(withoutPublished);
    });
});
describe('hasEngagementSignal', () => {
    it('is true for a registered source even with zero engagement', () => {
        expect((0, newsIngestion_scoring_1.hasEngagementSignal)({ source: 'hackernews', engagement: { points: 0, comments: 0, stars_delta: 0 } })).toBe(true);
    });
    it('is true for a non-registered source with nonzero engagement', () => {
        expect((0, newsIngestion_scoring_1.hasEngagementSignal)({ source: 'rss', engagement: { points: 5, comments: 0, stars_delta: 0 } })).toBe(true);
    });
    it('is false for a non-registered source with zero engagement', () => {
        expect((0, newsIngestion_scoring_1.hasEngagementSignal)({ source: 'rss', engagement: { points: 0, comments: 0, stars_delta: 0 } })).toBe(false);
    });
});
