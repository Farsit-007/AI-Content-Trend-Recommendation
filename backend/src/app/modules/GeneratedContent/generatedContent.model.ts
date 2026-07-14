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
    facebook_post: { type: String, required: true },
    facebook_reel_script: { type: String, required: true },
    linkedin_post: { type: String, required: true },
    youtube_idea: { type: youtubeIdeaSchema, required: true },
    caption: { type: String, required: true },
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
  created_at: { type: Date, default: Date.now },
});

// Prevent duplicate drafts for the same team+news item pair
generatedContentSchema.index({ team_id: 1, news_item_id: 1 }, { unique: true, sparse: true });
generatedContentSchema.index({ team_id: 1, created_at: -1 });

export const GeneratedContent = model<IGeneratedContent>(
  'GeneratedContent',
  generatedContentSchema,
  'generated_content',
);
