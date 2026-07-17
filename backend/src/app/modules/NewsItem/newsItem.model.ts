import { Schema, model } from 'mongoose';
import { INewsItem } from './newsItem.interface';

const engagementSnapshotSchema = new Schema(
  {
    at: { type: Date, required: true },
    points: { type: Number, required: true },
    comments: { type: Number, required: true },
    stars_delta: { type: Number, required: true },
  },
  { _id: false },
);

const newsItemSchema = new Schema<INewsItem>({
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
  current_trend_score: { type: Number, index: true },
  category: { type: String },
  relevance_score: { type: Number },
  impact_note: { type: String },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: (v: number[]) => v.length === 1536,
      message: 'embedding must be a 1536-dimension vector (openai/text-embedding-3-small)',
    },
  },
  opportunity_score: { type: Number },
  category_confidence: { type: Number },
  needs_review: { type: Boolean, default: false },
  processed: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  engagement_history: { type: [engagementSnapshotSchema] },
  engagement_refreshed_at: { type: Date },
  source_removed: { type: Boolean, default: false },
  lifecycle: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  archived_at: { type: Date },
  archive_reason: { type: String, enum: ['max_age', 'trend_floor', 'source_removed'] },
});

export const NewsItem = model<INewsItem>('NewsItem', newsItemSchema, 'news_items');
