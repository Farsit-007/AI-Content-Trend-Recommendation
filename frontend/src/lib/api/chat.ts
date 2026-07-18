import { apiPost } from './client';
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
