export interface IBrandVoiceExample {
  team_id: string;
  platform: string;
  category?: string;
  content: string;
  embedding: number[];
  engagement_hint?: string;
  added_by?: string;
  created_at: Date;
}
