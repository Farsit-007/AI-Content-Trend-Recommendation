import { apiGet, apiPost } from './client';
import type { LanguageStyle } from './content';

export interface AskChatPayload {
  team_id: string;
  message: string;
  conversation_id?: string;
  language?: LanguageStyle;
}

export interface AskChatResponse {
  conversation_id: string;
  reply: string;
}

/** POST /chat — news-grounded conversational Q&A, scoped to the team's subscribed categories
 *  and brand voice. Uncached, one turn per call; `conversation_id` threads follow-ups. */
export function askChat(payload: AskChatPayload): Promise<AskChatResponse> {
  return apiPost<AskChatResponse>('/chat', payload);
}

export interface ConversationSummary {
  conversation_id: string;
  last_message_preview: string;
  message_count: number;
  last_activity_at: string;
}

/** GET /chat/conversations — this team's past conversations, most recently active first. */
export function listConversations(teamId: string): Promise<ConversationSummary[]> {
  return apiGet<ConversationSummary[]>('/chat/conversations', { params: { team_id: teamId } });
}

export interface ChatMessageDto {
  team_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** GET /chat/conversations/:conversationId — full, chronological message history for one
 *  conversation, scoped to the team (a conversationId from another team resolves to `[]`). */
export function getConversationMessages(teamId: string, conversationId: string): Promise<ChatMessageDto[]> {
  return apiGet<ChatMessageDto[]>(`/chat/conversations/${conversationId}`, { params: { team_id: teamId } });
}
