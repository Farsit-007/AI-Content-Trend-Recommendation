import { Schema, model } from 'mongoose';

export interface IBrandVoiceExample {
  platform: string;
  category?: string;
  content: string;
  embedding: number[];
  engagement_hint?: string;
  added_by?: string;
  created_at: Date;
}

const brandVoiceExampleSchema = new Schema<IBrandVoiceExample>({
  platform: { type: String, required: true },
  category: { type: String },
  content: { type: String, required: true },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: (v: number[]) => v.length === 1536,
      message: 'embedding must be a 1536-dimension vector (openai/text-embedding-3-small)',
    },
  },
  engagement_hint: { type: String },
  added_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

export const BrandVoiceExample = model<IBrandVoiceExample>(
  'BrandVoiceExample',
  brandVoiceExampleSchema,
  'brand_voice_examples',
);
