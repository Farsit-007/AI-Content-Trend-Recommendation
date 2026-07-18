import { Schema, model } from 'mongoose';
import { IStyleExample, IStylePack } from './stylePack.interface';

const stylePackSchema = new Schema<IStylePack>({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  language: { type: String, enum: ['bangla', 'english', 'banglish'], required: true },
  tone_tags: { type: [String], default: [] },
  style_card: { type: String },
  style_card_generated_at: { type: Date },
  style_card_example_count: { type: Number },
  is_active: { type: Boolean, default: true },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
});

export const StylePack = model<IStylePack>('StylePack', stylePackSchema, 'style_packs');

const styleExampleSchema = new Schema<IStyleExample>({
  style_pack_id: { type: String, required: true },
  content: { type: String, required: true },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: (v: number[]) => v.length === 1536,
      message: 'embedding must be a 1536-dimension vector (openai/text-embedding-3-small)',
    },
  },
  platform: { type: String, enum: ['facebook', 'linkedin', 'other'], default: 'other' },
  source_ref: { type: String },
  engagement_hint: { type: String },
  created_at: { type: Date, default: Date.now },
});

styleExampleSchema.index({ style_pack_id: 1 });

export const StyleExample = model<IStyleExample>('StyleExample', styleExampleSchema, 'style_examples');
