import { GeneratedContent } from './contentGeneration.interface';

type ParsedContent = Omit<GeneratedContent, 'topic'>;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const isValidYoutubeIdea = (v: unknown): v is ParsedContent['youtube_idea'] => {
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

/** Strict validation, no partial-object fallback — a malformed or incomplete response is a hard failure. */
export const parseGeneratedContent = (raw: string): ParsedContent | null => {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();

  let parsed: Record<string, unknown>;
  try {
    const result = JSON.parse(cleaned);
    if (typeof result !== 'object' || result === null || Array.isArray(result)) return null;
    parsed = result;
  } catch {
    return null;
  }

  if (
    !isNonEmptyString(parsed.facebook_post) ||
    !isNonEmptyString(parsed.facebook_reel_script) ||
    !isNonEmptyString(parsed.linkedin_post) ||
    !isNonEmptyString(parsed.caption) ||
    !isValidYoutubeIdea(parsed.youtube_idea)
  ) {
    return null;
  }

  return {
    facebook_post: parsed.facebook_post,
    facebook_reel_script: parsed.facebook_reel_script,
    linkedin_post: parsed.linkedin_post,
    caption: parsed.caption,
    youtube_idea: parsed.youtube_idea,
  };
};
