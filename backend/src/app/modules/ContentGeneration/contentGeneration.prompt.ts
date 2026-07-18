import { ChatMessage } from '../../lib/llmClient';
import { VoiceOptions, languageInstruction } from '../../lib/voiceProfile';
import { FactSheet } from './contentGeneration.facts';
import { CONTENT_FORMATS, FormatId } from './contentGeneration.formats';
import { FewShotExample, NewsItemContext } from './contentGeneration.interface';

const GROUNDING_INSTRUCTION =
  'When source context (a snippet and/or "why it matters" note) is provided below, ground your factual claims in ' +
  'that material and stay faithful to it — do not invent specific facts, numbers, quotes, features, or dates beyond ' +
  'what is given. When a fact list is provided, treat it as the primary source of truth for specifics. If the ' +
  'provided context is thin, write more generally about the topic rather than fabricating specifics.';

/** Applied to text-kind formats only — youtube_idea is a structured object, not prose. */
export const ANTI_AI_TELL_INSTRUCTION =
  'Vary sentence lengths naturally. Open with a concrete hook, never a generic scene-setter. Avoid formulaic ' +
  'closers ("সবশেষে বলা যায়…", "In conclusion", "To sum up"). Prefer concrete details over abstractions. Write ' +
  "with the rhythm of the provided examples, not generic marketing copy. Don't overuse em-dashes or bullet lists in prose.";

export interface StyleContext {
  card?: string;
  examples: FewShotExample[];
}

const formatExamples = (examples: FewShotExample[]): string =>
  examples
    .map((example, i) => {
      const hint = example.engagement_hint ? ` (engagement: ${example.engagement_hint})` : '';
      return `${i + 1}. [${example.source}]${hint}\n${example.content}`;
    })
    .join('\n\n');

export const buildSystemPrompt = (
  fewShotExamples: FewShotExample[],
  voiceOptions: VoiceOptions,
  styleContext?: StyleContext,
): string => {
  const voiceInstructions =
    `Language: ${languageInstruction(voiceOptions.language)}` +
    (voiceOptions.custom_instructions
      ? `\nTeam instructions (always follow these): ${voiceOptions.custom_instructions}`
      : '');

  if (fewShotExamples.length === 0 && !styleContext) {
    return (
      'You are a social media content generator for a growth marketing team. ' +
      'Write engaging, platform-appropriate content in a clear, professional, brand-neutral tone — ' +
      'this team has not yet submitted brand-voice examples, so do not invent a specific persona or slang.\n\n' +
      `${voiceInstructions}\n\n` +
      GROUNDING_INSTRUCTION
    );
  }

  const styleBlocks = [
    styleContext?.card ? `How this style writes:\n${styleContext.card}` : null,
    styleContext?.examples.length
      ? `Style examples — write exactly in this style, tone, and rhythm:\n${formatExamples(styleContext.examples)}`
      : null,
  ].filter((block): block is string => Boolean(block));

  // Relabeled (pack owns tone, team examples contribute terminology) only when a style pack is present —
  // the no-pack path keeps the original "Brand voice examples:" label so its output stays byte-identical.
  const teamExamplesBlock = fewShotExamples.length
    ? styleContext
      ? `This team's own past posts — blend their terminology, audience, and product specifics:\n${formatExamples(fewShotExamples)}`
      : `Brand voice examples:\n${formatExamples(fewShotExamples)}`
    : null;

  const introLine = styleContext
    ? 'You are a social media content generator for a growth marketing team. ' +
      'A curated writing style is provided below — match its tone, rhythm, and register exactly. ' +
      "If the team's own past posts are also provided, blend in their terminology, audience, and product specifics " +
      'without diluting the style.'
    : 'You are a social media content generator for a growth marketing team. ' +
      "Match the team's own voice, tone, and style shown in the examples below — these are real examples of how " +
      'this team writes. Study word choice, tone, formatting, emoji use, ' +
      'and structure, then write new content that reads as if the same team wrote it.';

  return [introLine, voiceInstructions, ...styleBlocks, teamExamplesBlock, GROUNDING_INSTRUCTION]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');
};

const formatFactSheet = (factSheet: FactSheet): string =>
  'Key facts from the source (ground your claims in these; do not invent beyond them):\n' +
  factSheet.facts.map((fact) => `- ${fact}`).join('\n') +
  `\nSummary: ${factSheet.summary}`;

export const buildUserPrompt = (topic: string, newsContext?: NewsItemContext, factSheet?: FactSheet): string => {
  const contextParts = [
    newsContext?.category ? `category: ${newsContext.category}` : null,
    newsContext?.impact_note ? `why it matters: ${newsContext.impact_note}` : null,
    newsContext?.snippet ? `source snippet: "${newsContext.snippet}"` : null,
    newsContext?.url ? `source: ${newsContext.url}` : null,
  ].filter(Boolean);

  const blocks = [
    `Generate content about: "${topic}"`,
    contextParts.length ? `Additional context (${contextParts.join('; ')})` : null,
    factSheet ? formatFactSheet(factSheet) : null,
  ].filter((block): block is string => Boolean(block));

  return blocks.join('\n\n');
};

const REFINE_EDITING_CONTRACT =
  'Edit the draft per the instruction. Preserve its language, register, and factual claims. Change no more than ' +
  'the instruction requires. Return ONLY the revised text — no markdown fences, no commentary, no labels.';

export const buildRefineMessages = (
  currentText: string,
  instruction: string,
  voiceOptions: VoiceOptions,
  styleCard?: string,
): ChatMessage[] => {
  const voiceInstructions =
    `Language: ${languageInstruction(voiceOptions.language)}` +
    (voiceOptions.custom_instructions
      ? `\nTeam instructions (always follow these): ${voiceOptions.custom_instructions}`
      : '');

  const systemPrompt = [
    'You are editing an existing social media post draft for a growth marketing team.',
    voiceInstructions,
    styleCard ? `How this style writes:\n${styleCard}` : null,
    ANTI_AI_TELL_INSTRUCTION,
    REFINE_EDITING_CONTRACT,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Draft:\n${currentText}\n\nInstruction: ${instruction}` },
  ];
};

export const buildMessages = (
  format: FormatId,
  topic: string,
  fewShotExamples: FewShotExample[],
  voiceOptions: VoiceOptions,
  newsContext?: NewsItemContext,
  styleContext?: StyleContext,
  factSheet?: FactSheet,
): ChatMessage[] => {
  const formatDef = CONTENT_FORMATS[format];
  const systemPrompt = [
    buildSystemPrompt(fewShotExamples, voiceOptions, styleContext),
    formatDef.kind === 'text' ? ANTI_AI_TELL_INSTRUCTION : null,
    formatDef.instruction,
  ]
    .filter((block): block is string => Boolean(block))
    .join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildUserPrompt(topic, newsContext, factSheet) },
  ];
};
