/**
 * Hard enforcement layer on top of contentGeneration.prompt.ts's "languageDominance" instruction.
 * That instruction is a request, not a guarantee — models reliably drift toward a few-shot example's
 * language over a system instruction. This module detects that drift after the fact so the caller can
 * retry once with a reinforced, last-position instruction (see contentGeneration.service.ts).
 */
import { banglaScriptRatio } from '../../lib/scriptDetection';
import { languageInstruction } from '../../lib/voiceProfile';
import { LanguageStyle } from '../Team/team.interface';

const MISMATCH_RATIO_THRESHOLD = 0.05;

export const isLanguageMismatched = (text: string, language: LanguageStyle): boolean => {
  if (text.trim().length === 0) return false;
  const ratio = banglaScriptRatio(text);
  if (language === 'english') return ratio > MISMATCH_RATIO_THRESHOLD;
  return ratio <= MISMATCH_RATIO_THRESHOLD;
};

/** Appended as a trailing system message on retry — last position gets the most weight, and it
 *  repeats the actual language instruction rather than just scolding, so it stands alone even if
 *  the model doesn't attend back to the original system prompt. */
export const buildLanguageReinforcement = (language: LanguageStyle): string =>
  'CORRECTION: your previous attempt did not follow the language instruction. This overrides any ' +
  'style card, style examples, or brand-voice examples shown above — they set tone only, never language. ' +
  `${languageInstruction(language)} Rewrite the entire response accordingly.`;
