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

/**
 * Which team-owned collection a context block came from. Every one of these is scoped to the asking
 * team by the query that fetched it — there is no source here that can carry another team's data.
 * `team_profile` is synthesized from the team document rather than retrieved, so a question like
 * "what are we subscribed to?" is answerable from the team's own record.
 */
export type ChatContextSource =
  'news_item' | 'draft' | 'brand_voice' | 'team_profile';

/**
 * How wide the news scope had to go before it found anything.
 *
 *  - `subscribed` — matched the team's own categories (or their group). The normal case.
 *  - `broadened`  — nothing matched literally, so the search widened to the broad groups those
 *                   subscriptions roll up under. Surfaced to the client so a widened answer reads
 *                   as widened rather than passing for a precise one.
 *  - `none`       — the team's feed contains nothing on this question. The prompt instructs the
 *                   model to say exactly that. It never falls through to the global pool.
 */
export type ChatContextTier = 'subscribed' | 'broadened' | 'none';

export interface ChatContextItem {
  source: ChatContextSource;
  content: string;
  /** `_id` of the underlying document, when there is one — lets a client link a citation. */
  ref_id?: string;
  /** Short human label for a citation chip (news title, draft topic, …). */
  label?: string;
}

/** The citation targets sent to the client, in the same order the prompt numbered them. */
export interface ChatSourceRef {
  n: number;
  source: ChatContextSource;
  ref_id?: string;
  label?: string;
}

export interface ChatResponse {
  conversation_id: string;
  reply: string;
  /** Absent on the not-ready guidance path, which does no retrieval. */
  context_tier?: ChatContextTier;
  sources?: ChatSourceRef[];
}

/** One row of `GET /chat/conversations` — a summary, not the full message list. */
export interface ConversationSummary {
  conversation_id: string;
  last_message_preview: string;
  message_count: number;
  last_activity_at: Date;
}
