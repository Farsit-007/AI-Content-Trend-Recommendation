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
  /** Subset of NEWS_CATEGORIES the team wants its feed filtered to; empty = all categories. */
  subscribed_categories: string[];
  /** Optional reference to a globally-curated StylePack; a dangling/inactive reference must never break team ops. */
  default_style_pack_id?: string;
  /**
   * Per-task `LlmModel` id override (task name -> `LlmModel._id` string). A dangling/inactive/
   * wrong-capability reference must never break team ops — `resolveModelForTask` soft-fails
   * through to the next tier rather than erroring. Defaults to `{}` (no overrides).
   */
  default_models: Record<string, string>;
  voice_profile?: ITeamVoiceProfile;
  created_at: Date;
}

/** Join row for the many-to-many User<->Team relationship. */
export interface ITeamMembership {
  team_id: string;
  user_id: string;
  created_at: Date;
}
