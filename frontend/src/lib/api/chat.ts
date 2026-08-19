import { apiGet, apiPost } from './client';
import { streamSse } from './sse';
import { ApiError } from './types';
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

export interface AskChatStreamHandlers {
  /** Fires once, before any text — carries the conversation id to thread follow-ups onto. */
  onStart?: (conversationId: string) => void;
  /** Fires per token chunk. Append, don't replace. */
  onDelta: (text: string) => void;
  /** Fires once with the complete reply, after it has been persisted server-side. */
  onDone?: (reply: string) => void;
  signal?: AbortSignal;
}

/**
 * POST /chat/stream — the same grounded answer as `askChat`, delivered token by token.
 *
 * Worth the extra client complexity because chat is the one surface where the wait is unavoidable
 * and fully visible: a buffered answer means staring at a spinner for the whole provider round trip,
 * in a product category where every comparable tool shows the first token in under a second.
 *
 * Throws on a terminal `error` event, matching what `askChat` does, so callers keep one error path.
 */
export async function askChatStream(payload: AskChatPayload, handlers: AskChatStreamHandlers): Promise<void> {
  let streamError: string | null = null;

  await streamSse('/chat/stream', payload, {
    signal: handlers.signal,
    onEvent: (event, data) => {
      const d = data as { conversation_id?: string; text?: string; reply?: string; message?: string };
      if (event === 'start' && d.conversation_id) handlers.onStart?.(d.conversation_id);
      else if (event === 'delta' && d.text) handlers.onDelta(d.text);
      else if (event === 'done') handlers.onDone?.(d.reply ?? '');
      else if (event === 'error') streamError = d.message ?? 'Chat request failed';
    },
  });

  if (streamError) throw new ApiError(streamError, 502, []);
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
