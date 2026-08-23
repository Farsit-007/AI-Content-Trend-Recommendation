import { LanguageStyle } from '../modules/Team/team.interface';
import { Team } from '../modules/Team/team.model';
import { cached } from './cache';

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
  english: 'Write in clear, natural English.',
};

export const languageInstruction = (language: LanguageStyle): string =>
  LANGUAGE_INSTRUCTIONS[language];

const VOICE_TTL_SECONDS = 300;

export const resolveVoiceOptions = async (
  teamId: string,
  languageOverride?: LanguageStyle,
): Promise<VoiceOptions> => {
  // Only the stored profile is cached, never the resolved result: `languageOverride` is per-request,
  // and folding it into the cached value would serve one caller's override to the next caller.
  const profile = await cached('team:voice', teamId, VOICE_TTL_SECONDS, async () => {
    const team = await Team.findById(teamId).select('voice_profile').lean().catch(() => null);
    return {
      default_language: team?.voice_profile?.default_language ?? null,
      custom_instructions: team?.voice_profile?.custom_instructions ?? null,
    };
  });

  return {
    language: languageOverride ?? profile.default_language ?? 'bangla',
    custom_instructions: profile.custom_instructions || undefined,
  };
};
