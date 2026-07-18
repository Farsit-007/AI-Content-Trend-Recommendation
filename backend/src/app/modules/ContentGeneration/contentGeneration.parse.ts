import { YoutubeIdea } from './contentGeneration.interface';

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const isValidYoutubeIdea = (v: unknown): v is YoutubeIdea => {
  if (typeof v !== 'object' || v === null) return false;
  const idea = v as Record<string, unknown>;
  return (
    isNonEmptyString(idea.title) &&
    isNonEmptyString(idea.hook) &&
    Array.isArray(idea.chapters) &&
    idea.chapters.every((chapter) => typeof chapter === 'string') &&
    isNonEmptyString(idea.thumbnail_concept)
  );
};

/** Reasoning models (e.g. Nemotron, DeepSeek-R1 variants) sometimes leak their chain of thought
 *  into `message.content` as a `<think>…</think>` block before the real answer — strip it, or the
 *  user-visible post opens with raw model reasoning. */
const stripReasoningBlocks = (raw: string): string => raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');

/** Text formats return plain prose, not JSON — this only strips incidental fences/quoting a model might add. */
export const parseTextFormat = (raw: string): string | null => {
  const cleaned = stripReasoningBlocks(raw)
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
};

/** Strict validation, no partial-object fallback — a malformed or incomplete response is a hard failure. */
export const parseYoutubeIdea = (raw: string): YoutubeIdea | null => {
  const cleaned = stripReasoningBlocks(raw).replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  return isValidYoutubeIdea(parsed) ? parsed : null;
};
