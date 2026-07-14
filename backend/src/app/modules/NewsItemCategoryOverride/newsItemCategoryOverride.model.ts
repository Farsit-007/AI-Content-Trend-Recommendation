import { Schema, model } from 'mongoose';
import { INewsItemCategoryOverride } from './newsItemCategoryOverride.interface';

const newsItemCategoryOverrideSchema = new Schema<INewsItemCategoryOverride>({
  news_item_id: { type: String, required: true },
  team_id: { type: String, required: true },
  category: { type: String },
  opportunity_score: { type: Number },
  overridden_by: { type: String, required: true },
  overridden_at: { type: Date, default: Date.now },
});

// A team has at most one override per news item; upserts key off this pair.
newsItemCategoryOverrideSchema.index({ news_item_id: 1, team_id: 1 }, { unique: true });

export const NewsItemCategoryOverride = model<INewsItemCategoryOverride>(
  'NewsItemCategoryOverride',
  newsItemCategoryOverrideSchema,
  'news_item_category_overrides',
);
