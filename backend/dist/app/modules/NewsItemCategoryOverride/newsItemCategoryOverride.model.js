"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsItemCategoryOverride = void 0;
const mongoose_1 = require("mongoose");
const newsItemCategoryOverrideSchema = new mongoose_1.Schema({
    news_item_id: { type: String, required: true },
    team_id: { type: String, required: true },
    category: { type: String },
    opportunity_score: { type: Number },
    overridden_by: { type: String, required: true },
    overridden_at: { type: Date, default: Date.now },
});
// A team has at most one override per news item; upserts key off this pair.
newsItemCategoryOverrideSchema.index({ news_item_id: 1, team_id: 1 }, { unique: true });
exports.NewsItemCategoryOverride = (0, mongoose_1.model)('NewsItemCategoryOverride', newsItemCategoryOverrideSchema, 'news_item_category_overrides');
