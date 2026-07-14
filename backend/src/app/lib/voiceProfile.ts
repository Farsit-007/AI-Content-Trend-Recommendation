import { LanguageStyle } from '../modules/Team/team.interface';
import { Team } from '../modules/Team/team.model';

/**
 * Effective writing options for one LLM call. Resolution order for language:
 * per-request override → team voice_profile.default_language → 'bangla'.
 * The model is never fine-tuned — this profile plus the team's brand_voice_examples
 * are the personalization layer for every generated output.
 */
export interface VoiceOptions {
  language: LanguageStyle;
  custom_instructions?: string;
}

const LANGUAGE_INSTRUCTIONS: Record<LanguageStyle, string> = {
  bangla:
    'Write in Bengali (বাংলা script). Keep widely-used English technical terms ' +
    '(e.g. AI, JavaScript, framework, API) in English, as Bangla tech content naturally does. ' +
    'Never write Bengali words in Latin letters.',
  banglish:
    'Write in Banglish — Bengali written in Latin letters, mixed naturally with English technical terms.',
  english: 'Write in clear, natural English.',
};

export const languageInstruction = (language: LanguageStyle): string =>
  LANGUAGE_INSTRUCTIONS[language];

export const resolveVoiceOptions = async (
  teamId: string,
  languageOverride?: LanguageStyle,
): Promise<VoiceOptions> => {
  const team = await Team.findById(teamId).catch(() => null);
  const profile = team?.voice_profile;
  return {
    language: languageOverride ?? profile?.default_language ?? 'bangla',
    custom_instructions: profile?.custom_instructions || undefined,
  };
};
