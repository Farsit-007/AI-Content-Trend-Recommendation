import { randomUUID } from 'crypto';
import AppError from '../../errors/AppError';
import config from '../../config';
import { chatCompletionForTask, embedForTask } from '../../lib/modelResolution';
import { logger } from '../../lib/logger';
import { LanguageStyle } from '../Team/team.interface';
import { resolveVoiceOptions } from '../../lib/voiceProfile';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { TeamService } from '../Team/team.service';
import { ChatRequest, ChatResponse, ConversationSummary, IChatMessage } from './chat.interface';
import { ChatMessage } from './chat.model';
import { buildMessages } from './chat.prompt';
import { fetchConversationHistory, fetchNewsContext } from './chat.retrieval';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
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

const askChat = async (payload: ChatRequest, requestingUser: IRequestUser): Promise<ChatResponse> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const conversationId = payload.conversation_id ?? randomUUID();

  if (!(await TeamService.isTeamReady(payload.team_id))) {
    const { language } = await resolveVoiceOptions(payload.team_id, payload.language);
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

  const [questionEmbedding, history, voiceOptions] = await Promise.all([
    embedForTask('embedding', payload.message, { teamId: payload.team_id }),
    fetchConversationHistory(payload.team_id, conversationId),
    resolveVoiceOptions(payload.team_id, payload.language),
  ]);

  const retrieval = await fetchNewsContext(questionEmbedding);
  logger.info(
    {
      teamId: payload.team_id,
      topSimilarity: retrieval.topSimilarity,
      poolSize: retrieval.poolSize,
      contextCount: retrieval.context.length,
      lowRelevance: retrieval.topSimilarity < config.chat.context_low_relevance_threshold,
    },
    '[Chat] context retrieval quality',
  );
  const messages = buildMessages(payload.message, retrieval.context, history, voiceOptions);

  await ChatMessage.create({
    team_id: payload.team_id,
    conversation_id: conversationId,
    role: 'user',
    content: payload.message,
  });

  let reply: string;
  try {
    reply = await chatCompletionForTask('chat', messages, { teamId: payload.team_id, temperature: 0.7 });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[Chat] LLM call failed');
    throw new AppError(httpStatus.BAD_GATEWAY, 'Chat request failed — please try again');
  }

  await ChatMessage.create({
    team_id: payload.team_id,
    conversation_id: conversationId,
    role: 'assistant',
    content: reply,
  });

  return { conversation_id: conversationId, reply };
};

const CONVERSATION_LIST_LIMIT = 50;
const PREVIEW_MAX_CHARS = 140;

const preview = (content: string): string =>
  content.length > PREVIEW_MAX_CHARS ? `${content.slice(0, PREVIEW_MAX_CHARS)}…` : content;

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
const listConversations = async (teamId: string, requestingUser: IRequestUser): Promise<ConversationSummary[]> => {
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

  return ChatMessage.find({ team_id: teamId, conversation_id: conversationId }).sort({ created_at: 1 });
};

export const ChatService = {
  askChat,
  listConversations,
  getConversationMessages,
};
