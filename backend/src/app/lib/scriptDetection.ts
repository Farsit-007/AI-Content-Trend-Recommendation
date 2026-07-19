const BANGLA_SCRIPT_PATTERN = /[ঀ-৿]/g;

/** Proportion (0-1) of non-whitespace characters that are Bengali script. */
export const banglaScriptRatio = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const banglaChars = trimmed.match(BANGLA_SCRIPT_PATTERN)?.length ?? 0;
  return banglaChars / trimmed.length;
};

/** Cheap script-presence label for prompt-side annotation — not a full language detector. */
export const detectScriptLanguage = (text: string): 'bangla' | 'english' =>
  banglaScriptRatio(text) > 0.05 ? 'bangla' : 'english';
