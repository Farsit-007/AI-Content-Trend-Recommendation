"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformPost = void 0;
const mongoose_1 = require("mongoose");
const platformPostSchema = new mongoose_1.Schema({
    team_id: { type: String, required: true },
    platform: { type: String, required: true },
    post_id: { type: String, required: true },
    content_snippet: { type: String },
    embedding: {
        type: [Number],
        required: true,
        validate: {
            validator: (v) => v.length === 1536,
            message: 'embedding must be a 1536-dimension vector (openai/text-embedding-3-small)',
        },
    },
    metrics: {
        reach: { type: Number, default: 0 },
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
        views: { type: Number, default: 0 },
    },
    published_at: { type: Date },
    fetched_at: { type: Date, default: Date.now },
});
platformPostSchema.index({ team_id: 1, platform: 1, post_id: 1 }, { unique: true });
exports.PlatformPost = (0, mongoose_1.model)('PlatformPost', platformPostSchema, 'platform_posts');
