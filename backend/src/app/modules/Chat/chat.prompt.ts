import { AdapterChatMessage } from '../LlmProvider/llmProvider.adapters';
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
 * turn and nothing was ever cacheable.
 *
 * Blocks 0 and 1 are marked `cacheable`, which each adapter honours in its own way: Anthropic gets
 * an explicit `cache_control` breakpoint at the end of the run, while OpenAI and OpenRouter cache
 * stable prefixes automatically and have the hint stripped before the request is sent.
 *
 * Block 1 varies with the team's language, and a request may override that mid-conversation. That
 * is fine and intended — the prefix is keyed per team *and* language, so a user toggling English
 * ↔ বাংলা simply warms a second prefix rather than invalidating the first.
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

/**
 * The final user turn: this turn's retrieved context, then the question.
 *
 * The context deliberately sits here rather than in a system block. It is the single most volatile
 * and largest part of the prompt, so anywhere earlier it truncates the cacheable prefix at ~250
 * tokens — below the 1024-token minimum both Anthropic and OpenAI require, which means no request
 * ever cached anything. Behind the history instead, the prefix is
 * `[persona, team, …history]`: stable within a conversation, and growing, so each turn extends the
 * previous turn's cached prefix instead of invalidating it.
 *
 * Grounding is unaffected: the *rules* stay in the system persona, which keeps its authority; only
 * the *data* moved. Putting retrieved passages in the user turn is the ordinary RAG layout.
 */
const buildUserTurn = (
  question: string,
  context: ChatContextItem[],
  tier: ChatContextTier,
): string =>
  `${TIER_NOTE[tier]}\n\nContext:\n${formatContext(context)}\n\nQuestion: ${question}`;

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
): AdapterChatMessage[] => [
  // Everything marked `cacheable` forms the prefix, and it must stay contiguous: the first unmarked
  // message ends it, and anything after that is re-read at full price on every turn.
  { role: 'system', content: STATIC_PERSONA, cacheable: true },
  { role: 'system', content: buildTeamBlock(voiceOptions), cacheable: true },
  // History is cacheable because a turn that already happened never changes. This is where the
  // prefix earns its keep: by turn three or four it is long enough to clear the providers' 1024-token
  // minimum, which the two static blocks alone (~250 tokens) never do on their own.
  ...history.map((msg): AdapterChatMessage => ({
    role: msg.role,
    content: msg.content,
    cacheable: true,
  })),
  { role: 'user', content: buildUserTurn(question, context, tier) },
];
