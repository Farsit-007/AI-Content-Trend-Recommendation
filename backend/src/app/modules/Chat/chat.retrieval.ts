import { FilterQuery } from 'mongoose';
import config from '../../config';
import { logger } from '../../lib/logger';
import { cosineSimilarity } from '../../lib/similarity';
import { INewsItem } from '../NewsItem/newsItem.interface';
import { NewsItem } from '../NewsItem/newsItem.model';
import {
  ChatContextItem,
  ChatContextTier,
  IChatMessage,
} from './chat.interface';
import { ChatMessage } from './chat.model';
import { TeamChatContext } from './chat.teamContext';
import { findChatContextByVector } from './chat.vectorRetrieval';

const NEWS_LIMIT = 5;
const HISTORY_LIMIT = 10;

export interface NewsCandidate {
  _id?: unknown;
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

/** A `RankedNewsContext` plus how wide the scope had to go to produce it. */
export interface ScopedNewsContext extends RankedNewsContext {
  tier: ChatContextTier;
}

/** One rung of the team-scope ladder: a tier label and the query that implements it. */
export interface NewsScopeTier {
  tier: Exclude<ChatContextTier, 'none'>;
  filter: FilterQuery<INewsItem>;
}

/**
 * The scope ladder, in the order it is tried. Pure and exported so the leakage tests can assert on
 * the *filters themselves* rather than only on what came back from a seeded database.
 *
 * Tier 1 is the same predicate the feed already uses (`newsItem.service.ts`): an item matches if the
 * team subscribed to its exact category, or to the broad group it rolls up under.
 *
 * Tier 2 only exists when it can match something tier 1 cannot — i.e. when some broad group is not
 * itself a subscription. For a team subscribed only to fixed-six names (`broad_group === name`)
 * that condition is false and the ladder is one rung, which is correct: widening to "AI" for a team
 * subscribed to "AI" would return exactly the same set.
 *
 * There is deliberately no third rung. Running out of tiers means the answer is "nothing in this
 * team's feed covers that" — never the global pool.
 */
export const buildNewsScopeTiers = (
  teamContext: TeamChatContext,
): NewsScopeTier[] => {
  const { subscribedCategories: subs, broadGroups } = teamContext;
  if (subs.length === 0) return [];

  const tiers: NewsScopeTier[] = [
    {
      tier: 'subscribed',
      filter: {
        $or: [{ category: { $in: subs } }, { category_group: { $in: subs } }],
      },
    },
  ];

  if (broadGroups.some((group) => !subs.includes(group))) {
    tiers.push({
      tier: 'broadened',
      filter: { category_group: { $in: broadGroups } },
    });
  }

  return tiers;
};

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
    ref_id:
      item._id === undefined || item._id === null
        ? undefined
        : String(item._id),
    label: item.title,
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

/**
 * Retrieves and ranks the best news context for one rung of the scope ladder.
 *
 * `scopeFilter` is the team's category scope. It is applied *inside* both paths — as a
 * `$vectorSearch` pre-filter, and as part of the Mongo query on the in-memory path — never to the
 * results afterwards. Post-filtering would let the limit be spent on other teams' items and then
 * discard them, which is wasteful when the pool is small and silently lossy when it is not.
 */
const fetchScopedNews = async (
  questionEmbedding: number[],
  scopeFilter: FilterQuery<INewsItem>,
  since: Date,
): Promise<RankedNewsContext> => {
  // Preferred path: let the database do the search against its vector index, over the whole corpus.
  // Ready but off by default — see CHAT_VECTOR_SEARCH_ENABLED. Any failure (missing index, wrong
  // filter fields, a non-Atlas deployment) falls through to the in-memory path below rather than
  // failing the question, so enabling this can never be worse than not enabling it.
  if (config.chat.vector_search_enabled) {
    try {
      const candidates = await findChatContextByVector(
        questionEmbedding,
        since,
        NEWS_LIMIT,
        scopeFilter,
      );
      if (candidates.length > 0) {
        return rankNewsItems(candidates, questionEmbedding);
      }
      logger.warn(
        '[Chat] vector search returned no candidates — falling back to the in-memory pool',
      );
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[Chat] vector search failed — falling back to the in-memory pool. Is news_items_vector_index present, ' +
          'with lifecycle, created_at, category and category_group declared as filter fields?',
      );
    }
  }

  // The `.sort()` is load-bearing, not cosmetic. `context_pool_cap` truncates this query, so without
  // an explicit order Mongo returns documents in natural order and the cap keeps an arbitrary slice —
  // meaning that once the 7-day active window exceeds the cap, chat semantically ranks a effectively
  // random subset of the pool and answers silently degrade as the product accumulates more data.
  // Ordering by live trend score makes the cap drop the coldest tail instead.
  const items = await NewsItem.find(
    { lifecycle: 'active', created_at: { $gte: since }, ...scopeFilter },
    {
      title: 1,
      snippet: 1,
      content: 1,
      category: 1,
      impact_note: 1,
      trend_score: 1,
      opportunity_score: 1,
      embedding: 1,
    },
  )
    .sort({ current_trend_score: -1, created_at: -1 })
    .limit(config.chat.context_pool_cap);

  return rankNewsItems(items, questionEmbedding);
};

/**
 * Team-scoped news context.
 *
 * Walks the scope ladder and returns the first rung that produced anything, labelled with which rung
 * that was. Exhausting the ladder returns an empty `none` result — **not** an unscoped search. That
 * is the whole point of this function: before it took a `teamContext`, it searched every team's
 * items, so two teams asking the same question received identical context.
 */
export const fetchNewsContext = async (
  questionEmbedding: number[],
  teamContext: TeamChatContext,
): Promise<ScopedNewsContext> => {
  const since = new Date(
    Date.now() - config.chat.context_window_days * 24 * 3600 * 1000,
  );

  for (const { tier, filter } of buildNewsScopeTiers(teamContext)) {
    const ranked = await fetchScopedNews(questionEmbedding, filter, since);
    if (ranked.context.length > 0) {
      return { ...ranked, tier };
    }
  }

  return { context: [], topSimilarity: 0, poolSize: 0, tier: 'none' };
};

export const fetchConversationHistory = async (
  teamId: string,
  conversationId: string,
  limit: number = HISTORY_LIMIT,
): Promise<IChatMessage[]> => {
  const messages = await ChatMessage.find({
    team_id: teamId,
    conversation_id: conversationId,
  })
    .sort({ created_at: -1 })
    .limit(limit);

  return messages.reverse();
};
