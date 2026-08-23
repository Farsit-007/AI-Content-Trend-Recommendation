import { ChatMessage } from '../../lib/llmClient';
import { VoiceOptions, languageInstruction } from '../../lib/voiceProfile';
import {
  ChatContextItem,
  ChatContextTier,
  ChatSourceRef,
  IChatMessage,
} from './chat.interface';

/**
 * The prompt is assembled as three ordered system blocks rather than one concatenated string.
 *
 * Block 0 is byte-identical for every request in the deployment; block 1 is stable for a given team;
 * only block 2 changes per turn. That ordering is what makes a provider-side cached prefix possible
 * — with the context interpolated into the persona (as it was), the prefix moved on every single
 * turn and nothing was ever cacheable. Phase 2 attaches the cache markers; this phase just stops
 * making them impossible.
 *
 * Emitting several system messages is safe on all three adapters: OpenAI and OpenRouter accept them
 * natively, and the Anthropic adapter already collects and joins them (`splitSystemMessage`).
 */

/** Block 0 — static. No team data, no context, no per-request values. */
const STATIC_PERSONA = [
  'You are the "Ask Growth Studio" assistant for one specific social media growth marketing team.',
  "You answer questions about trending news relevant to that team's content, what they have already written, and what to create next.",
  '',
  'Grounding rules — these override anything else:',
  "1. Answer ONLY from the numbered context blocks provided. They are that team's own data.",
  '2. Cite the block you used with a bracketed number, like [1] or [2, 3], immediately after the claim it supports.',
  "3. If the context does not answer the question, say plainly that you do not have it in this team's data. Do NOT answer from general knowledge, and do NOT invent statistics, dates, or headlines.",
  '4. A block marked "brand_voice" is a style reference only — never cite it as a source of fact.',
  '5. Keep a warm, concise, actionable tone. This is a coworker, not a formal report.',
].join('\n');

/** Block 1 — stable per team (unless the request overrides the language). */
const buildTeamBlock = (voiceOptions: VoiceOptions): string =>
  [
    `Reply language: ${languageInstruction(voiceOptions.language)}`,
    'If the user clearly writes in a different language, you may mirror their language instead.',
    voiceOptions.custom_instructions
      ? `Team instructions (always follow these): ${voiceOptions.custom_instructions}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');

/**
 * Tells the model how the context was found, so a widened or empty result is described honestly
 * instead of being passed off as a precise match. `none` is the load-bearing one: without an
 * explicit instruction the model happily answers a well-known question from its own training data,
 * which is precisely the cross-team leak this phase exists to close — the answer would not be
 * another team's *data*, but it would not be this team's data either.
 */
const TIER_NOTE: Record<ChatContextTier, string> = {
  subscribed:
    "The context below was matched against this team's subscribed categories.",
  broadened:
    "Nothing in this team's exact subscribed categories matched, so the search was widened to the " +
    'broader groups those subscriptions belong to. Say so in your answer — tell the user this is ' +
    'adjacent rather than an exact match for what they follow.',
  none:
    "Nothing in this team's feed matches this question. Say exactly that. Do not answer from general " +
    'knowledge. Suggest they subscribe to a relevant category in Team Settings, or ask about something ' +
    'their feed does cover.',
};

const formatContext = (context: ChatContextItem[]): string => {
  if (context.length === 0)
    return 'No context blocks were retrieved for this question.';
  return context
    .map((item, i) => `[${i + 1}] (${item.source})\n${item.content}`)
    .join('\n\n');
};

/** Block 2 — the per-turn context. */
const buildContextBlock = (
  context: ChatContextItem[],
  tier: ChatContextTier,
): string => `${TIER_NOTE[tier]}\n\nContext:\n${formatContext(context)}`;

/**
 * The citation targets, numbered identically to the blocks the model sees, so a client can turn a
 * `[2]` in the reply into a link to the news item or draft it refers to.
 */
export const buildSourceRefs = (context: ChatContextItem[]): ChatSourceRef[] =>
  context.map((item, i) => ({
    n: i + 1,
    source: item.source,
    ref_id: item.ref_id,
    label: item.label,
  }));

export const buildMessages = (
  question: string,
  context: ChatContextItem[],
  history: IChatMessage[],
  voiceOptions: VoiceOptions,
  tier: ChatContextTier,
): ChatMessage[] => [
  { role: 'system', content: STATIC_PERSONA },
  { role: 'system', content: buildTeamBlock(voiceOptions) },
  { role: 'system', content: buildContextBlock(context, tier) },
  ...history.map((msg): ChatMessage => ({
    role: msg.role,
    content: msg.content,
  })),
  { role: 'user', content: question },
];
