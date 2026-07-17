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
exports.aggregatePlatformBreakdowns = exports.aggregateOverview = void 0;
const analytics_model_1 = require("../Analytics/analytics.model");
const platformPost_model_1 = require("../PlatformPost/platformPost.model");
const pctDelta = (current, prior) => {
    if (prior === 0)
        return current > 0 ? 100 : 0;
    return Math.round(((current - prior) / prior) * 100 * 10) / 10;
};
const aggregateOverview = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const priorStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const [currentPosts, priorPosts] = yield Promise.all([
        platformPost_model_1.PlatformPost.find({ team_id: teamId, published_at: { $gte: periodStart } }).lean(),
        platformPost_model_1.PlatformPost.find({ team_id: teamId, published_at: { $gte: priorStart, $lt: periodStart } }).lean(),
    ]);
    const sum = (posts) => {
        let reach = 0, engagements = 0, views = 0;
        for (const p of posts) {
            reach += p.metrics.reach;
            engagements += p.metrics.likes + p.metrics.comments + p.metrics.shares;
            views += p.metrics.views;
        }
        return {
            reach,
            engagements,
            views,
            engagement_rate: reach > 0 ? Math.round((engagements / reach) * 1000) / 10 : 0,
        };
    };
    const current = sum(currentPosts);
    const prior = sum(priorPosts);
    return Object.assign(Object.assign({}, current), { delta: {
            reach: pctDelta(current.reach, prior.reach),
            engagements: pctDelta(current.engagements, prior.engagements),
            views: pctDelta(current.views, prior.views),
            engagement_rate: pctDelta(current.engagement_rate, prior.engagement_rate),
        } });
});
exports.aggregateOverview = aggregateOverview;
const aggregatePlatformBreakdowns = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const rollups = yield analytics_model_1.AnalyticsRollup.find({ team_id: teamId }).lean();
    return rollups.map((r) => ({
        platform: r.platform,
        status: r.status,
        overview: r.status === 'ok' ? r.overview : null,
        top_posts: r.status === 'ok' ? r.top_posts : [],
        best_times: r.status === 'ok' ? r.best_times : [],
        content_breakdown: r.status === 'ok' ? r.content_breakdown : [],
        fetched_at: r.fetched_at,
    }));
});
exports.aggregatePlatformBreakdowns = aggregatePlatformBreakdowns;
