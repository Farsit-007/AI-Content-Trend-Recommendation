"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsItem = void 0;
const mongoose_1 = require("mongoose");
const newsItemSchema = new mongoose_1.Schema({
    source: { type: String, required: true },
    source_id: { type: String, required: true },
    content_hash: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    snippet: { type: String },
    content: { type: String },
    content_status: { type: String, enum: ['none', 'partial', 'full', 'failed'], default: 'none' },
    content_fetched_at: { type: Date },
    word_count: { type: Number },
    published_at: { type: Date },
    engagement: {
        points: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        stars_delta: { type: Number, default: 0 },
    },
    trend_score: { type: Number, default: 0 },
    category: { type: String },
    relevance_score: { type: Number },
    impact_note: { type: String },
    embedding: {
        type: [Number],
        required: true,
        validate: {
            validator: (v) => v.length === 1536,
            message: 'embedding must be a 1536-dimension vector (openai/text-embedding-3-small)',
        },
    },
    opportunity_score: { type: Number },
    category_confidence: { type: Number },
    needs_review: { type: Boolean, default: false },
    processed: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
});
exports.NewsItem = (0, mongoose_1.model)('NewsItem', newsItemSchema, 'news_items');
