/**
 * Optional second-pass critique-and-rewrite step (style-fidelity-critique-pass). Off by default —
 * gated by `config.content_generation.critique_enabled`/`critique_formats`. Soft-fail throughout:
 * any LLM error or a result failing the degenerate-output guards below discards the critique output
 * and keeps the first-pass draft, never a request error (see design.md decisions 2 and 4 of
 * style-fidelity-critique-pass). Guards and the eligibility gate are pure, independently testable,
 * and reused unchanged by the bake-off harness's `--critique both` mode.
 */
import config from '../../config';
import { chatCompletionForTask } from '../../lib/modelResolution';
import { logger } from '../../lib/logger';
import { VoiceOptions, languageInstruction } from '../../lib/voiceProfile';
import { LanguageStyle } from '../Team/team.interface';
import { CONTENT_FORMATS, FormatId } from './contentGeneration.formats';

const LENGTH_BAND_MIN = 0.5;
const LENGTH_BAND_MAX = 1.6;
/** Max allowed relative drop in Bangla-script character proportion before we suspect language drift. */
const MAX_SCRIPT_RATIO_DROP = 0.5;

const CRITIQUE_EDITING_CONTRACT =
  'You are reviewing a social media post draft for AI-sounding writing. Identify sentences that read as ' +
  'formulaic AI output — generic openers/closers, uniform sentence rhythm, marketing-voice padding, or ' +
  'abstraction without specifics — and rewrite ONLY those sentences to match the style below. Preserve every ' +
  'fact, the language, the approximate length, and the overall structure of the draft. Do not add new claims, ' +
  'change the language, or touch sentences that already read naturally. Return ONLY the revised text — no ' +
  'markdown fences, no commentary, no labels.';

/**
 * Structural eligibility only — text-kind format with a resolved pack — independent of the
 * `critique_enabled`/`critique_formats` config. Split out from `isCritiqueEligible` so the bake-off
 * harness's `--critique both` mode (bangla-quality-bakeoff-harness's `runBakeoffMatrix`) can measure
 * the pass's effect *before* the live flag is ever turned on — gating on the enabled flag there
 * would always produce zero critiqued cells, defeating the harness's own purpose.
 */
export const isCritiqueStructurallyEligible = (
  format: FormatId,
  stylePack: { style_card?: string } | null,
): boolean => CONTENT_FORMATS[format].kind === 'text' && stylePack !== null;

/** The full gate used by live serving: config flag, configured format list, plus structural eligibility. */
export const isCritiqueEligible = (format: FormatId, stylePack: { style_card?: string } | null): boolean =>
  config.content_generation.critique_enabled &&
  config.content_generation.critique_formats.includes(format) &&
  isCritiqueStructurallyEligible(format, stylePack);

export const isNonEmpty = (candidate: string): boolean => candidate.trim().length > 0;

/**
 * Asymmetric on purpose: a legitimate edit removing a formulaic closer can shrink meaningfully; a
 * critique that roughly doubles length has almost certainly turned into a rewrite, which violates
 * the "rewrite only what's flagged" contract.
 */
export const isWithinLengthBand = (draft: string, candidate: string): boolean => {
  const draftLength = draft.trim().length;
  if (draftLength === 0) return false;
  const ratio = candidate.trim().length / draftLength;
  return ratio >= LENGTH_BAND_MIN && ratio <= LENGTH_BAND_MAX;
};

const BANGLA_SCRIPT_PATTERN = /[ঀ-৿]/g;

const banglaScriptRatio = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const banglaChars = trimmed.match(BANGLA_SCRIPT_PATTERN)?.length ?? 0;
  return banglaChars / trimmed.length;
};

/** Cheap proxy for "the critique pass didn't flip the output back toward English." Non-Bangla languages skip this check entirely — the ratio has no meaningful target for them. */
export const hasStableScriptRatio = (draft: string, candidate: string, language: LanguageStyle): boolean => {
  if (language !== 'bangla') return true;
  const draftRatio = banglaScriptRatio(draft);
  if (draftRatio === 0) return true; // nothing Bangla in the draft to compare against — don't block on this guard
  const candidateRatio = banglaScriptRatio(candidate);
  return candidateRatio >= draftRatio * (1 - MAX_SCRIPT_RATIO_DROP);
};

/**
 * One LLM call, soft-fail to the original draft on any error or guard failure. Deliberately sees
 * only the draft and the style card — not the original few-shot examples or fact sheet (design.md
 * decision 3) — to keep this a cheap touch-up pass, not a second full generation.
 */
export const critiqueText = async (
  draft: string,
  styleCard: string | undefined,
  voiceOptions: VoiceOptions,
  teamId?: string,
): Promise<string> => {
  const systemPrompt = [
    CRITIQUE_EDITING_CONTRACT,
    `Language: ${languageInstruction(voiceOptions.language)}`,
    styleCard ? `How this style writes:\n${styleCard}` : null,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');

  let raw: string;
  try {
    raw = await chatCompletionForTask(
      'critique',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Draft:\n${draft}` },
      ],
      { teamId, temperature: 0.4 },
    );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      '[ContentGeneration] Critique pass LLM call failed — keeping first-pass draft',
    );
    return draft;
  }

  const candidate = raw.trim();
  if (
    !isNonEmpty(candidate) ||
    !isWithinLengthBand(draft, candidate) ||
    !hasStableScriptRatio(draft, candidate, voiceOptions.language)
  ) {
    logger.warn('[ContentGeneration] Critique pass output failed the degenerate-output guards — keeping first-pass draft');
    return draft;
  }

  return candidate;
};
