export type LanguageStyle = 'bangla' | 'english' | 'banglish';

/**
 * Team-owned writing preferences. The model is never fine-tuned — this profile plus the
 * team's brand_voice_examples are what personalize every LLM output.
 */
export interface ITeamVoiceProfile {
  default_language: LanguageStyle;
  custom_instructions?: string;
}

export interface ITeam {
  name: string;
  description?: string;
  created_by: string;
  custom_categories: string[];
  voice_profile?: ITeamVoiceProfile;
  created_at: Date;
}

/** Join row for the many-to-many User<->Team relationship. */
export interface ITeamMembership {
  team_id: string;
  user_id: string;
  created_at: Date;
}
