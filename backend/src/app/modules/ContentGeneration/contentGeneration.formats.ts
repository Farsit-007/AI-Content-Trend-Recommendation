export type FormatId = 'facebook_post' | 'linkedin_post' | 'facebook_reel_script' | 'youtube_idea' | 'caption';

export const FORMAT_IDS: FormatId[] = [
  'facebook_post',
  'linkedin_post',
  'facebook_reel_script',
  'youtube_idea',
  'caption',
];

export interface ContentFormatDefinition {
  label: string;
  kind: 'text' | 'json';
  instruction: string;
  /** Style-pack example retrieval prefers examples tagged with this platform for this format,
   *  backfilling from the rest of the pack when there aren't enough matches. Unset means no
   *  preference — retrieval falls back to plain topic-similarity ranking. */
  preferredPlatform?: 'facebook' | 'linkedin';
}

export const CONTENT_FORMATS: Record<FormatId, ContentFormatDefinition> = {
  facebook_post: {
    label: 'Facebook post',
    kind: 'text',
    instruction:
      'Write a Facebook post, 150-400 words. Open with a hook in the very first line — a question, a bold ' +
      'claim, or a concrete detail, never a generic scene-setter. Use short paragraphs (1-3 sentences each). ' +
      'Return ONLY the post text — no title, no labels, no markdown fences, no commentary.',
    preferredPlatform: 'facebook',
  },
  linkedin_post: {
    label: 'LinkedIn post',
    kind: 'text',
    instruction:
      'Write a LinkedIn post, 1,200-2,500 characters. Use short, line-broken paragraphs (professional LinkedIn ' +
      'formatting — one or two sentences per visual line, blank lines between paragraphs). End with 3-5 relevant ' +
      'hashtags on their own line. Return ONLY the post text — no title, no labels, no markdown fences, no commentary.',
    preferredPlatform: 'linkedin',
  },
  facebook_reel_script: {
    label: 'Facebook Reel script',
    kind: 'text',
    instruction:
      'Write a Facebook Reel script for a ~60-90 second video. Structure it as labeled scenes with voice-over ' +
      'lines, e.g. "Scene 1 (0-5s): <VO line>", covering a hook, the core content, and a call to action. ' +
      'Return ONLY the script text — no markdown fences, no commentary.',
    preferredPlatform: 'facebook',
  },
  caption: {
    label: 'Caption',
    kind: 'text',
    instruction:
      'Write a short social media caption, at most 200 characters. Return ONLY the caption text — no labels, ' +
      'no markdown fences, no commentary.',
    preferredPlatform: 'facebook',
  },
  youtube_idea: {
    label: 'YouTube video idea',
    kind: 'json',
    instruction:
      'Produce a YouTube video idea. Respond with ONLY a strict JSON object, no markdown fences, no commentary. ' +
      'It must have exactly these keys: { "title": "<string>", "hook": "<string>", "chapters": ["<string>", ...], ' +
      '"thumbnail_concept": "<string>" }.',
  },
};

export const DEFAULT_FORMATS: FormatId[] = ['facebook_post', 'linkedin_post'];

/** Text-kind formats only — youtube_idea is a structured object, excluded from refine. */
export const TEXT_FORMAT_IDS: FormatId[] = FORMAT_IDS.filter((id) => CONTENT_FORMATS[id].kind === 'text');
