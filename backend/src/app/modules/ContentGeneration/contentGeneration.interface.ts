export interface YoutubeIdea {
  title: string;
  hook: string;
  chapters: string[];
  thumbnail_concept: string;
}

export interface GeneratedContent {
  topic: string;
  facebook_post: string;
  facebook_reel_script: string;
  linkedin_post: string;
  youtube_idea: YoutubeIdea;
  caption: string;
}

export interface GenerateContentRequest {
  team_id: string;
  topic: string;
  news_item_id?: string;
}

export interface FewShotExample {
  source: 'brand_voice_example' | 'platform_post';
  content: string;
  engagement_hint?: string;
}

export interface NewsItemContext {
  category?: string;
  impact_note?: string;
}
