import config from '../../config';
import { logger } from '../../lib/logger';
import { cosineSimilarity } from '../../lib/similarity';
import { NewsItem } from '../NewsItem/newsItem.model';
import { ChatContextItem, IChatMessage } from './chat.interface';
import { ChatMessage } from './chat.model';
import { findChatContextByVector } from './chat.vectorRetrieval';

const NEWS_LIMIT = 5;
const HISTORY_LIMIT = 10;

export interface NewsCandidate {
  title: string;
  snippet?: string;
  content?: string;
  category?: string;
  impact_note?: string;
  trend_score: number;
  current_trend_score?: number;
  opportunity_score?: number;
  embedding: number[];
}

export interface RankedNewsContext {
  context: ChatContextItem[];
  topSimilarity: number;
  poolSize: number;
}

/**
 * Pure ranking step, kept separate from the DB fetch so it's testable without Mongo. Ranks the
 * entire candidate pool by semantic similarity to the question — no trend-score pre-filter, so a
 * topically relevant item that hasn't accumulated engagement yet is never starved out before it
 * gets a chance to match (see chat-retrieval-topical-coverage).
 */
export const rankNewsItems = (
  candidates: NewsCandidate[],
  questionEmbedding: number[],
  limit: number = NEWS_LIMIT,
): RankedNewsContext => {
  const ranked = candidates
    .map((item) => ({
      similarity: cosineSimilarity(questionEmbedding, item.embedding),
      item,
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const context = ranked.slice(0, limit).map(({ item }) => ({
    source: 'news_item' as const,
    content: [
      `Title: ${item.title}`,
      item.category ? `Category: ${item.category}` : undefined,
      item.snippet ? `Snippet: ${item.snippet}` : undefined,
      item.content ? `Content: ${item.content.slice(0, 300)}` : undefined,
      item.impact_note ? `Impact: ${item.impact_note}` : undefined,
      `Trend score: ${item.trend_score}${item.opportunity_score !== undefined ? `, Opportunity score: ${item.opportunity_score}` : ''}`,
    ]
      .filter(Boolean)
      .join('\n'),
  }));

  return {
    context,
    topSimilarity: ranked.length ? ranked[0].similarity : 0,
    poolSize: candidates.length,
  };
};

export const fetchNewsContext = async (
  questionEmbedding: number[],
): Promise<RankedNewsContext> => {
  const since = new Date(Date.now() - config.chat.context_window_days * 24 * 3600 * 1000);

  // Preferred path: let the database do the search against its vector index, over the whole corpus.
  // Ready but off by default — see CHAT_VECTOR_SEARCH_ENABLED. Any failure (missing index, wrong
  // filter fields, a non-Atlas deployment) falls through to the in-memory path below rather than
  // failing the question, so enabling this can never be worse than not enabling it.
  if (config.chat.vector_search_enabled) {
    try {
      const candidates = await findChatContextByVector(questionEmbedding, since, NEWS_LIMIT);
      if (candidates.length > 0) {
        return rankNewsItems(candidates, questionEmbedding);
      }
      logger.warn('[Chat] vector search returned no candidates — falling back to the in-memory pool');
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[Chat] vector search failed — falling back to the in-memory pool. Is news_items_vector_index present?',
      );
    }
  }

  // The `.sort()` is load-bearing, not cosmetic. `context_pool_cap` truncates this query, so without
  // an explicit order Mongo returns documents in natural order and the cap keeps an arbitrary slice —
  // meaning that once the 7-day active window exceeds the cap, chat semantically ranks a effectively
  // random subset of the pool and answers silently degrade as the product accumulates more data.
  // Ordering by live trend score makes the cap drop the coldest tail instead.
  const items = await NewsItem.find(
    { lifecycle: 'active', created_at: { $gte: since } },
    { title: 1, snippet: 1, content: 1, category: 1, impact_note: 1, trend_score: 1, opportunity_score: 1, embedding: 1 },
  )
    .sort({ current_trend_score: -1, created_at: -1 })
    .limit(config.chat.context_pool_cap);

  return rankNewsItems(items, questionEmbedding);
};

export const fetchConversationHistory = async (
  teamId: string,
  conversationId: string,
  limit: number = HISTORY_LIMIT,
): Promise<IChatMessage[]> => {
  const messages = await ChatMessage.find({ team_id: teamId, conversation_id: conversationId })
    .sort({ created_at: -1 })
    .limit(limit);

  return messages.reverse();
};
