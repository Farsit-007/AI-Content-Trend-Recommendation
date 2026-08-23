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

/**
 * How wide the backend had to search this team's feed before it found anything.
 *
 *  - `subscribed` — matched the team's own categories. The normal case; nothing to show.
 *  - `broadened`  — nothing matched literally, so the search widened to the broader groups those
 *                   subscriptions belong to. Worth telling the user: the answer is adjacent to what
 *                   they follow rather than squarely inside it.
 *  - `none`       — this team's feed has nothing on the question. The backend refuses to answer from
 *                   general knowledge, so the reply will say so.
 */
export type ChatContextTier = 'subscribed' | 'broadened' | 'none';

/** One numbered context block the answer may cite as `[n]`. */
export interface ChatSourceRef {
  n: number;
  source: 'news_item' | 'draft' | 'brand_voice' | 'team_profile';
  ref_id?: string;
  label?: string;
}

export interface AskChatResponse {
  conversation_id: string;
  reply: string;
  context_tier?: ChatContextTier;
  sources?: ChatSourceRef[];
}

/** POST /chat — news-grounded conversational Q&A, scoped to the team's subscribed categories
 *  and brand voice. Uncached, one turn per call; `conversation_id` threads follow-ups. */
export function askChat(payload: AskChatPayload): Promise<AskChatResponse> {
  return apiPost<AskChatResponse>('/chat', payload);
}

export interface AskChatStreamHandlers {
  /** Fires once, before any text — carries the conversation id to thread follow-ups onto. */
  onStart?: (conversationId: string) => void;
  /**
   * Fires once after retrieval and before the first token, with how the team's feed was searched
   * and what the answer can cite. Separate from `onStart` because the tier isn't known until
   * retrieval finishes, while the conversation id has to be available immediately.
   */
  onContext?: (tier: ChatContextTier, sources: ChatSourceRef[]) => void;
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
      const d = data as {
        conversation_id?: string;
        text?: string;
        reply?: string;
        message?: string;
        context_tier?: ChatContextTier;
        sources?: ChatSourceRef[];
      };
      if (event === 'start' && d.conversation_id) handlers.onStart?.(d.conversation_id);
      else if (event === 'context' && d.context_tier) handlers.onContext?.(d.context_tier, d.sources ?? []);
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
