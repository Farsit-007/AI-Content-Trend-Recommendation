import { LanguageStyle } from '../Team/team.interface';

export type StyleExamplePlatform = 'facebook' | 'linkedin' | 'other';

export interface IStylePack {
  name: string;
  slug: string;
  description?: string;
  language: LanguageStyle;
  tone_tags: string[];
  style_card?: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
}

export interface IStyleExample {
  style_pack_id: string;
  content: string;
  embedding: number[];
  platform: StyleExamplePlatform;
  source_ref?: string;
  engagement_hint?: string;
  created_at: Date;
}
