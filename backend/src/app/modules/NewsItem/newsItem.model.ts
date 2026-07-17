import { Schema, model } from 'mongoose';
import { INewsItem } from './newsItem.interface';

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
});

export const NewsItem = model<INewsItem>('NewsItem', newsItemSchema, 'news_items');
