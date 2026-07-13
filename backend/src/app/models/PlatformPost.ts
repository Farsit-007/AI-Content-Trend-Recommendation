import { Schema, model } from 'mongoose';

export interface IPlatformPost {
  platform: string;
  post_id: string;
  content_snippet?: string;
  embedding: number[];
  metrics: {
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    views: number;
  };
  published_at?: Date;
  fetched_at: Date;
}

const platformPostSchema = new Schema<IPlatformPost>({
  platform: { type: String, required: true },
  post_id: { type: String, required: true },
  content_snippet: { type: String },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: (v: number[]) => v.length === 1536,
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

platformPostSchema.index({ platform: 1, post_id: 1 }, { unique: true });

export const PlatformPost = model<IPlatformPost>('PlatformPost', platformPostSchema, 'platform_posts');
