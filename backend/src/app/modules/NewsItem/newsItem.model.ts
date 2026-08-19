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

const corroborationSchema = new Schema(
  {
    source: { type: String, required: true },
    points: { type: Number, required: true, default: 0 },
    comments: { type: Number, required: true, default: 0 },
    url: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const newsItemSchema = new Schema<INewsItem>({
  source: { type: String, required: true },
  source_id: { type: String, required: true },
  content_hash: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  url: { type: String, required: true },
  discussion_url: { type: String },
  thumbnail_url: { type: String },
  description: { type: String },
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
  category: { type: String, index: true },
  // Broad-group parent (one of the fixed six) this item's `category` rolls up under — a fixed-six
  // category's group is itself; a discovered fine-grained category's group is assigned at
  // categorization time. See flexible-news-taxonomy-and-relevance.
  category_group: { type: String, index: true },
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
  // The LLM's 0-1 audience-fit judgement, persisted rather than consumed and discarded at ingest.
  // `opportunity_score` is derived from it, and per-team opportunity has to be recomputable long
  // after the run that created the item — when a team's brand voice changes, or during backfill.
  // Without this stored, the only way to re-derive it is to invert the weighted sum, which breaks
  // the moment the weights are retuned. Absent on items ingested before this field existed; see
  // `audienceFitOf` in NewsItemTeamScore/newsItemTeamScore.service.ts for the fallback.
  audience_fit: { type: Number },
  needs_review: { type: Boolean, default: false },
  processed: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  engagement_history: { type: [engagementSnapshotSchema] },
  engagement_refreshed_at: { type: Date },
  corroborations: { type: [corroborationSchema] },
  source_removed: { type: Boolean, default: false },
  lifecycle: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  archived_at: { type: Date },
  archive_reason: { type: String, enum: ['max_age', 'trend_floor', 'source_removed'] },
});

// The feed's actual query shape, which no single-field index above can serve end to end: filter on
// lifecycle, narrow by the team's subscribed categories or their broad groups, then sort by live
// trend score. With only single-field indexes Mongo picks one, then sorts the remainder in memory —
// survivable at current row counts and steadily worse as the collection grows (the retention job is
// what has been keeping it small enough to hide). Two indexes because the subscription filter is an
// `$or` over the two category fields, and an `$or` branch needs its own usable index each.
newsItemSchema.index({ lifecycle: 1, category: 1, current_trend_score: -1 });
newsItemSchema.index({ lifecycle: 1, category_group: 1, current_trend_score: -1 });

// Substring search over the feed is a collection scan by nature (unanchored case-insensitive regex
// cannot use a btree index). This supports the unfiltered default feed — lifecycle plus the default
// sort — which is the single most-requested query in the product.
newsItemSchema.index({ lifecycle: 1, current_trend_score: -1, created_at: -1 });

export const NewsItem = model<INewsItem>('NewsItem', newsItemSchema, 'news_items');
