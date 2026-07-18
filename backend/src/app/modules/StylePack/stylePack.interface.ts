import { LanguageStyle } from '../Team/team.interface';

export type StyleExamplePlatform = 'facebook' | 'linkedin' | 'other';

export interface IStylePack {
  name: string;
  slug: string;
  description?: string;
  language: LanguageStyle;
  tone_tags: string[];
  style_card?: string;
  style_card_generated_at?: Date;
  style_card_example_count?: number;
  is_active: boolean;
  created_by: string;
  created_at: Date;
}

export interface IStyleExample {
  style_pack_id: string;
  content: string;
  embedding: number[];
  /** Which text the stored embedding was actually computed from — see style-example-topic-summary-embeddings. */
  embedding_source: 'content' | 'topic_summary';
  /** LLM-extracted English topic summary, present only when embedding_source is 'topic_summary'. */
  topic_summary?: string;
  platform: StyleExamplePlatform;
  source_ref?: string;
  engagement_hint?: string;
  created_at: Date;
}
