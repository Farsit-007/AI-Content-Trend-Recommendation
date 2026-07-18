import { LanguageStyle } from '../Team/team.interface';

export interface IChatMessage {
  team_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

export interface ChatRequest {
  team_id: string;
  message: string;
  conversation_id?: string;
  /** Per-request override of the team's voice_profile.default_language. */
  language?: LanguageStyle;
}

export interface ChatResponse {
  conversation_id: string;
  reply: string;
}

export interface ChatContextItem {
  source: 'news_item';
  content: string;
}

/** One row of `GET /chat/conversations` — a summary, not the full message list. */
export interface ConversationSummary {
  conversation_id: string;
  last_message_preview: string;
  message_count: number;
  last_activity_at: Date;
}
