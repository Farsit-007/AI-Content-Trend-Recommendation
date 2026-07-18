import { YoutubeIdea } from '../ContentGeneration/contentGeneration.interface';

/** Any non-empty subset — at least one field SHALL be populated on every write (service-level guard). */
export interface IGeneratedContentFormats {
  facebook_post?: string;
  facebook_reel_script?: string;
  linkedin_post?: string;
  youtube_idea?: YoutubeIdea;
  caption?: string;
}

export type GeneratedContentSource = 'auto' | 'manual';
export type GeneratedContentStatus = 'draft' | 'approved' | 'dismissed';

export interface IGeneratedContent {
  team_id: string;
  news_item_id?: string;
  topic: string;
  formats: IGeneratedContentFormats;
  source: GeneratedContentSource;
  status: GeneratedContentStatus;
  model_used?: string;
  created_at: Date;
}

export interface IAutoGenerationSummary {
  teams_processed: number;
  drafts_created: number;
  skipped: number;
}
