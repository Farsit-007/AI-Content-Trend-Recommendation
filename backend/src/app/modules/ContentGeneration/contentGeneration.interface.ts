import { LanguageStyle } from '../Team/team.interface';
import { FormatId } from './contentGeneration.formats';

export interface YoutubeIdea {
  title: string;
  hook: string;
  chapters: string[];
  thumbnail_concept: string;
}

/** Only the requested formats are populated — `topic` plus any non-empty subset of the five. */
export interface GeneratedContent {
  topic: string;
  facebook_post?: string;
  facebook_reel_script?: string;
  linkedin_post?: string;
  youtube_idea?: YoutubeIdea;
  caption?: string;
}

export interface GenerateContentRequest {
  team_id: string;
  topic: string;
  news_item_id?: string;
  /** Per-request override of the team's voice_profile.default_language. */
  language?: LanguageStyle;
  /** Per-request override of the team's default_style_pack_id. */
  style_pack_id?: string;
  /** Non-empty unique subset of FormatId, max 5. Defaults to ['facebook_post', 'linkedin_post']. */
  formats?: FormatId[];
  /** When true, skip cache reads for the requested formats and overwrite their cache entries on success. */
  regenerate?: boolean;
}

export interface RefineContentRequest {
  team_id: string;
  /** Text formats only — youtube_idea is a structured object, excluded at validation. */
  format: FormatId;
  current_text: string;
  instruction: string;
  language?: LanguageStyle;
  style_pack_id?: string;
}

export interface FewShotExample {
  source: 'brand_voice_example' | 'style_pack_example';
  content: string;
  engagement_hint?: string;
}

export interface NewsItemContext {
  category?: string;
  impact_note?: string;
  snippet?: string;
  url?: string;
  content?: string;
  content_status?: string;
}
