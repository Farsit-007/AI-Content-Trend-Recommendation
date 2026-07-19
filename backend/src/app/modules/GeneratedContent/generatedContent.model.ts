import { Schema, model } from 'mongoose';
import { IGeneratedContent } from './generatedContent.interface';

const youtubeIdeaSchema = new Schema(
  {
    title: { type: String, required: true },
    hook: { type: String, required: true },
    chapters: { type: [String], required: true },
    thumbnail_concept: { type: String, required: true },
  },
  { _id: false },
);

const formatsSchema = new Schema(
  {
    facebook_post: { type: String, required: false },
    facebook_reel_script: { type: String, required: false },
    linkedin_post: { type: String, required: false },
    youtube_idea: { type: youtubeIdeaSchema, required: false },
    caption: { type: String, required: false },
  },
  { _id: false },
);

const generatedContentSchema = new Schema<IGeneratedContent>({
  team_id: { type: String, required: true },
  news_item_id: { type: String },
  topic: { type: String, required: true },
  formats: { type: formatsSchema, required: true },
  source: { type: String, enum: ['auto', 'manual'], required: true },
  status: { type: String, enum: ['draft', 'approved', 'dismissed'], default: 'draft' },
  model_used: { type: String },
  created_by: { type: String },
  created_by_name: { type: String },
  updated_by: { type: String },
  updated_by_name: { type: String },
  updated_at: { type: Date },
  created_at: { type: Date, default: Date.now },
});

// Prevent duplicate *auto-generated* drafts for the same team+news item pair — scoped to
// source: 'auto' so manual saves (a team may deliberately save more than one variant) never
// collide with it. The auto job's own `alreadyDrafted` check (queries across both sources)
// is what keeps it from re-drafting an item a team already saved manually.
generatedContentSchema.index(
  { team_id: 1, news_item_id: 1 },
  { unique: true, partialFilterExpression: { source: 'auto', news_item_id: { $exists: true } } },
);
generatedContentSchema.index({ team_id: 1, created_at: -1 });

export const GeneratedContent = model<IGeneratedContent>(
  'GeneratedContent',
  generatedContentSchema,
  'generated_content',
);
