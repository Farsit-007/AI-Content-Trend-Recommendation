import { randomUUID } from 'crypto';
import AppError from '../../errors/AppError';
import config from '../../config';
import {
  chatCompletionForTask,
  embedForTask,
  streamChatCompletionForTask,
} from '../../lib/modelResolution';
import { logger } from '../../lib/logger';
import { LanguageStyle } from '../Team/team.interface';
import { resolveVoiceOptions } from '../../lib/voiceProfile';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { TeamService } from '../Team/team.service';
import {
  ChatContextTier,
  ChatRequest,
  ChatResponse,
  ChatSourceRef,
  ConversationSummary,
  IChatMessage,
} from './chat.interface';
import { ChatMessage } from './chat.model';
import { buildMessages, buildSourceRefs } from './chat.prompt';
import { buildTeamCorpus } from './chat.corpus';
import { fetchConversationHistory } from './chat.retrieval';
import { resolveTeamChatContext } from './chat.teamContext';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You do not have access to this team',
    );
  }
};

/** Fixed, language-aware guidance shown instead of a grounded answer when a team isn't ready yet. */
const NOT_READY_GUIDANCE: Record<LanguageStyle, string> = {
  bangla:
    'আপনার টিমের সেটআপ এখনও সম্পূর্ণ হয়নি — নির্ভরযোগ্য উত্তর দেওয়ার জন্য টিম সেটিংসে গিয়ে অন্তত একটি ' +
    'বিষয়শ্রেণী সাবস্ক্রাইব করুন এবং একটি ব্র্যান্ড ভয়েস উদাহরণ যোগ করুন।',
  english:
    "Your team isn't fully set up yet — head to Team Settings and subscribe to at least one category " +
    'and add a brand-voice example so I can ground answers in your feed.',
};

/**
 * One log line per answered question, identical on both the buffered and streaming paths.
 *
 * `tier` is the field to watch in production: a rising share of `broadened` means teams are
 * subscribed too narrowly for their own feed, and any `none` at all is a team being told "I have
 * nothing on that" — both are product signals, not just diagnostics.
 */
const logRetrievalQuality = (
  teamId: string,
  corpus: {
    tier: ChatContextTier;
    context: unknown[];
    diagnostics: Record<string, number>;
  },
  streaming: boolean,
) => {
  logger.info(
    {
      teamId,
      tier: corpus.tier,
      contextCount: corpus.context.length,
      ...corpus.diagnostics,
      lowRelevance:
        corpus.diagnostics.newsTopSimilarity <
        config.chat.context_low_relevance_threshold,
      streaming,
    },
    '[Chat] context retrieval quality',
  );
};

const askChat = async (
  payload: ChatRequest,
  requestingUser: IRequestUser,
): Promise<ChatResponse> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const conversationId = payload.conversation_id ?? randomUUID();

  if (!(await TeamService.isTeamReady(payload.team_id))) {
    const { language } = await resolveVoiceOptions(
      payload.team_id,
      payload.language,
    );
    const reply = NOT_READY_GUIDANCE[language];

    await ChatMessage.create({
      team_id: payload.team_id,
      conversation_id: conversationId,
      role: 'user',
      content: payload.message,
    });
    await ChatMessage.create({
      team_id: payload.team_id,
      conversation_id: conversationId,
      role: 'assistant',
      content: reply,
    });

    return { conversation_id: conversationId, reply };
  }

  const [questionEmbedding, history, teamContext] = await Promise.all([
    embedForTask('embedding', payload.message, { teamId: payload.team_id }),
    fetchConversationHistory(payload.team_id, conversationId),
    resolveTeamChatContext(payload.team_id, payload.language),
  ]);

  const corpus = await buildTeamCorpus(
    payload.message,
    questionEmbedding,
    teamContext,
  );
  logRetrievalQuality(payload.team_id, corpus, false);

  const messages = buildMessages(
    payload.message,
    corpus.context,
    history,
    {
      language: teamContext.language,
      custom_instructions: teamContext.customInstructions,
    },
    corpus.tier,
  );

  await ChatMessage.create({
    team_id: payload.team_id,
    conversation_id: conversationId,
    role: 'user',
    content: payload.message,
  });

  let reply: string;
  try {
    reply = await chatCompletionForTask('chat', messages, {
      teamId: payload.team_id,
      temperature: 0.7,
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      '[Chat] LLM call failed',
    );
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Chat request failed — please try again',
    );
  }

  await ChatMessage.create({
    team_id: payload.team_id,
    conversation_id: conversationId,
    role: 'assistant',
    content: reply,
  });

  return {
    conversation_id: conversationId,
    reply,
    context_tier: corpus.tier,
    sources: buildSourceRefs(corpus.context),
  };
};

export interface ChatStreamHandlers {
  /** Called once, before the first token, with the conversation id the client should keep using. */
  onStart: (conversationId: string) => void;
  /**
   * Called once, after retrieval and before the first token, with how the context was scoped and
   * what it can be cited against. Sent as its own event rather than folded into `onStart` because
   * the tier is not known until retrieval has run, and `onStart` has to fire immediately so the
   * client can pin the conversation id.
   */
  onContext?: (tier: ChatContextTier, sources: ChatSourceRef[]) => void;
  onDelta: (text: string) => void;
  /** Called with the complete reply once it has been persisted. */
  onDone: (reply: string) => void;
  /** True when the client has gone — generation stops rather than finishing work nobody will read. */
  isCancelled: () => boolean;
}

/**
 * Streaming twin of `askChat`.
 *
 * Deliberately shares every step that decides *what* the answer is — access check, readiness
 * guidance, retrieval, prompt assembly, persistence — and differs only in how the text is delivered.
 * The two must not be allowed to drift into answering differently.
 *
 * Persistence rules, which streaming forces you to be explicit about:
 *  - The user's message is stored before generation starts, exactly as in `askChat`, so a question
 *    is never lost to a failed or abandoned answer.
 *  - The assistant's reply is stored only at the end, and only if something was produced. A partial
 *    reply from a client that disconnected mid-stream is still stored — the user saw those tokens,
 *    so the history has to match what was on their screen.
 */
const askChatStream = async (
  payload: ChatRequest,
  requestingUser: IRequestUser,
  handlers: ChatStreamHandlers,
): Promise<void> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const conversationId = payload.conversation_id ?? randomUUID();
  handlers.onStart(conversationId);

  const persist = (role: 'user' | 'assistant', content: string) =>
    ChatMessage.create({
      team_id: payload.team_id,
      conversation_id: conversationId,
      role,
      content,
    });

  if (!(await TeamService.isTeamReady(payload.team_id))) {
    const { language } = await resolveVoiceOptions(
      payload.team_id,
      payload.language,
    );
    const reply = NOT_READY_GUIDANCE[language];
    await persist('user', payload.message);
    await persist('assistant', reply);
    handlers.onDelta(reply);
    handlers.onDone(reply);
    return;
  }

  const [questionEmbedding, history, teamContext] = await Promise.all([
    embedForTask('embedding', payload.message, { teamId: payload.team_id }),
    fetchConversationHistory(payload.team_id, conversationId),
    resolveTeamChatContext(payload.team_id, payload.language),
  ]);

  const corpus = await buildTeamCorpus(
    payload.message,
    questionEmbedding,
    teamContext,
  );
  logRetrievalQuality(payload.team_id, corpus, true);
  handlers.onContext?.(corpus.tier, buildSourceRefs(corpus.context));

  const messages = buildMessages(
    payload.message,
    corpus.context,
    history,
    {
      language: teamContext.language,
      custom_instructions: teamContext.customInstructions,
    },
    corpus.tier,
  );

  await persist('user', payload.message);

  let reply = '';
  try {
    for await (const delta of streamChatCompletionForTask('chat', messages, {
      teamId: payload.team_id,
      temperature: 0.7,
    })) {
      if (handlers.isCancelled()) break;
      reply += delta;
      handlers.onDelta(delta);
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      '[Chat] streaming LLM call failed',
    );
    // A mid-stream failure after partial output: keep what the user already saw rather than
    // discarding it, then surface the failure so they know the answer is incomplete.
    if (reply.length > 0) await persist('assistant', reply);
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      'Chat request failed — please try again',
    );
  }

  if (reply.length > 0) {
    await persist('assistant', reply);
  }
  handlers.onDone(reply);
};

const CONVERSATION_LIST_LIMIT = 50;
const PREVIEW_MAX_CHARS = 140;

const preview = (content: string): string =>
  content.length > PREVIEW_MAX_CHARS
    ? `${content.slice(0, PREVIEW_MAX_CHARS)}…`
    : content;

interface ConversationAggregateRow {
  _id: string;
  message_count: number;
  last_activity_at: Date;
  last_message: string;
}

/**
 * A "conversation" has no independent existence — it's implicitly the set of `ChatMessage`
 * documents sharing a `conversation_id`. This aggregates over the existing
 * `{ team_id, conversation_id, created_at }` compound index rather than introducing a separate
 * collection to keep in sync (see chat-conversation-history design.md decision 2).
 */
const listConversations = async (
  teamId: string,
  requestingUser: IRequestUser,
): Promise<ConversationSummary[]> => {
  assertTeamAccess(teamId, requestingUser);

  const rows = await ChatMessage.aggregate<ConversationAggregateRow>([
    { $match: { team_id: teamId } },
    { $sort: { created_at: 1 } },
    {
      $group: {
        _id: '$conversation_id',
        message_count: { $sum: 1 },
        last_activity_at: { $max: '$created_at' },
        last_message: { $last: '$content' },
      },
    },
    { $sort: { last_activity_at: -1 } },
    { $limit: CONVERSATION_LIST_LIMIT },
  ]);

  return rows.map((row) => ({
    conversation_id: row._id,
    last_message_preview: preview(row.last_message),
    message_count: row.message_count,
    last_activity_at: row.last_activity_at,
  }));
};

/**
 * Full, chronologically-ordered message history for one conversation, scoped to the requesting
 * team. A `conversationId` belonging to a different team simply matches nothing (empty result),
 * never another team's messages — the `team_id` filter is part of the query itself, not a
 * post-fetch check.
 */
const getConversationMessages = async (
  teamId: string,
  conversationId: string,
  requestingUser: IRequestUser,
): Promise<IChatMessage[]> => {
  assertTeamAccess(teamId, requestingUser);

  return ChatMessage.find({
    team_id: teamId,
    conversation_id: conversationId,
  }).sort({ created_at: 1 });
};

export const ChatService = {
  askChat,
  askChatStream,
  listConversations,
  getConversationMessages,
};
