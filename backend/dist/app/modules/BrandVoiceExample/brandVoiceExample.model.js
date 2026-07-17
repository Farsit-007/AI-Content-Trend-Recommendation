"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandVoiceExample = void 0;
const mongoose_1 = require("mongoose");
const brandVoiceExampleSchema = new mongoose_1.Schema({
    team_id: { type: String, required: true },
    platform: { type: String, required: true },
    category: { type: String },
    content: { type: String, required: true },
    embedding: {
        type: [Number],
        required: true,
        validate: {
            validator: (v) => v.length === 1536,
            message: 'embedding must be a 1536-dimension vector (openai/text-embedding-3-small)',
        },
    },
    engagement_hint: { type: String },
    added_by: { type: String },
    created_at: { type: Date, default: Date.now },
});
exports.BrandVoiceExample = (0, mongoose_1.model)('BrandVoiceExample', brandVoiceExampleSchema, 'brand_voice_examples');
