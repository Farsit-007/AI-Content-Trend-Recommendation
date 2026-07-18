import { randomUUID } from 'crypto';
import AppError from '../../errors/AppError';
import { embed } from '../../lib/embeddings';
import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';
import { logger } from '../../lib/logger';
import { resolveVoiceOptions } from '../../lib/voiceProfile';
import { httpStatus } from '../../utils/httpStatus';
import { IRequestUser } from '../User/user.interface';
import { ChatRequest, ChatResponse } from './chat.interface';
import { ChatMessage } from './chat.model';
import { buildMessages } from './chat.prompt';
import { fetchConversationHistory, fetchNewsContext } from './chat.retrieval';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

const askChat = async (payload: ChatRequest, requestingUser: IRequestUser): Promise<ChatResponse> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const conversationId = payload.conversation_id ?? randomUUID();

  const [questionEmbedding, history, voiceOptions] = await Promise.all([
    embed(payload.message),
    fetchConversationHistory(payload.team_id, conversationId),
    resolveVoiceOptions(payload.team_id, payload.language),
  ]);

  const context = await fetchNewsContext(questionEmbedding);
  const messages = buildMessages(payload.message, context, history, voiceOptions);

  await ChatMessage.create({
    team_id: payload.team_id,
    conversation_id: conversationId,
    role: 'user',
    content: payload.message,
  });

  let reply: string;
  try {
    reply = await chatCompletion({ model: LLM_MODELS.standard, messages, temperature: 0.7 });
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

export const ChatService = {
  askChat,
};
