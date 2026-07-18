import { cosineSimilarity } from '../../lib/similarity';
import { NewsItem } from '../NewsItem/newsItem.model';
import { ChatContextItem, IChatMessage } from './chat.interface';
import { ChatMessage } from './chat.model';

const NEWS_TREND_POOL_SIZE = 30;
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

const liveTrendScore = (item: { trend_score: number; current_trend_score?: number }): number =>
  item.current_trend_score ?? item.trend_score;

/** Pure ranking step, kept separate from the DB fetch so it's testable without Mongo. */
export const rankNewsItems = (
  candidates: NewsCandidate[],
  questionEmbedding: number[],
  limit: number = NEWS_LIMIT,
  poolSize: number = NEWS_TREND_POOL_SIZE,
): ChatContextItem[] => {
  const topByTrend = candidates
    .slice()
    .sort((a, b) => liveTrendScore(b) - liveTrendScore(a))
    .slice(0, poolSize);

  return topByTrend
    .map((item) => ({
      similarity: cosineSimilarity(questionEmbedding, item.embedding),
      item,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ item }) => ({
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
};

export const fetchNewsContext = async (
  questionEmbedding: number[],
): Promise<ChatContextItem[]> => {
  const items = await NewsItem.find(
    {},
    { title: 1, snippet: 1, content: 1, category: 1, impact_note: 1, trend_score: 1, opportunity_score: 1, embedding: 1 },
  )
    .sort({ current_trend_score: -1 })
    .limit(NEWS_TREND_POOL_SIZE);

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
