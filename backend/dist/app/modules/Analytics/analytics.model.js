"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsRollup = void 0;
const mongoose_1 = require("mongoose");
const overviewSchema = new mongoose_1.Schema({
    reach: { type: Number, default: 0 },
    engagements: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    engagement_rate: { type: Number, default: 0 },
}, { _id: false });
const topPostSchema = new mongoose_1.Schema({
    post_id: { type: String, required: true },
    content_snippet: { type: String },
    reach: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    format: { type: String },
    published_at: { type: Date },
}, { _id: false });
const bestTimeSchema = new mongoose_1.Schema({
    hour: { type: Number, required: true },
    day: { type: Number, required: true },
    avg_reach: { type: Number, default: 0 },
}, { _id: false });
const contentBreakdownSchema = new mongoose_1.Schema({
    format: { type: String, required: true },
    avg_engagement_rate: { type: Number, default: 0 },
}, { _id: false });
const analyticsRollupSchema = new mongoose_1.Schema({
    team_id: { type: String, required: true },
    platform: { type: String, required: true },
    status: {
        type: String,
        enum: ['ok', 'not_connected', 'pending_approval', 'error'],
        required: true,
    },
    period: {
        start: { type: Date, required: true },
        end: { type: Date, required: true },
    },
    overview: { type: overviewSchema, default: () => ({}) },
    top_posts: { type: [topPostSchema], default: [] },
    best_times: { type: [bestTimeSchema], default: [] },
    content_breakdown: { type: [contentBreakdownSchema], default: [] },
    is_mock: { type: Boolean, default: false },
    fetched_at: { type: Date, default: Date.now },
});
analyticsRollupSchema.index({ team_id: 1, platform: 1 }, { unique: true });
exports.AnalyticsRollup = (0, mongoose_1.model)('AnalyticsRollup', analyticsRollupSchema, 'platform_analytics');
