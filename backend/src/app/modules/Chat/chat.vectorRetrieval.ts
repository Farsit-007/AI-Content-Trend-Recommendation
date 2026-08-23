import { FilterQuery } from 'mongoose';
import { INewsItem } from '../NewsItem/newsItem.interface';
import { NewsItem } from '../NewsItem/newsItem.model';
import { NewsCandidate } from './chat.retrieval';

const VECTOR_INDEX_NAME = 'news_items_vector_index';

/**
 * `numCandidates` is the approximate-nearest-neighbour search width, not the result count. Atlas
 * recommends 10-20x the requested limit; at a limit of 5 that would be trivially small, so this is
 * sized for recall over speed — the whole point of moving off the in-memory path is that we can
 * afford to search the entire corpus rather than an arbitrary 500-document slice.
 */
const NUM_CANDIDATES = 200;

/**
 * Chat context retrieval via Atlas Vector Search.
 *
 * Isolated in its own module for the same reason `newsItem.semanticMatch.ts` is: `$vectorSearch` has
 * no equivalent in `mongodb-memory-server`, so it cannot be exercised by an integration test and
 * needs to be a clean mock boundary. The caller wraps it in a try/catch and falls back to the
 * in-memory path — a missing or misconfigured index throws.
 *
 * Why this is worth having over the in-memory ranking it replaces:
 *
 *  - **Correctness.** The in-memory path fetches a capped window (`CHAT_CONTEXT_POOL_CAP`, 500) and
 *    ranks within it. Once the 7-day active window exceeds that cap, the best-matching item may
 *    simply not be in the slice that was loaded, whatever order it was loaded in. Ordering the cap by
 *    trend score (as the in-memory path now does) makes the truncation principled rather than
 *    arbitrary, but it is still a truncation applied *before* relevance is considered. This searches
 *    the whole corpus and truncates *after*.
 *  - **Cost.** The in-memory path transfers every candidate's 1536-float embedding to Node — roughly
 *    6 MB per chat request at the cap — to compute a ranking the database can do against an index.
 */
export const findChatContextByVector = async (
  questionEmbedding: number[],
  since: Date,
  limit: number,
  scopeFilter: FilterQuery<INewsItem> = {},
): Promise<NewsCandidate[]> => {
  if (limit <= 0) return [];

  return NewsItem.aggregate<NewsCandidate>([
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: questionEmbedding,
        numCandidates: NUM_CANDIDATES,
        limit,
        // Pre-filter, applied during the vector search rather than after it, so the limit is spent
        // on eligible items instead of being eaten by archived or out-of-window ones. Every field
        // named here must be indexed as a `filter` field on the Atlas index for this to be
        // accepted — see scripts/createVectorIndexes.ts.
        //
        // `scopeFilter` is the asking team's category scope and is *not* optional in practice: a
        // filter applied after the search would spend `limit` on other teams' items and then throw
        // them away, which is both wasteful and — once the limit is exhausted — silently wrong.
        // It has to run inside the search, which is why `category` and `category_group` were added
        // to the index's filter fields.
        filter: {
          lifecycle: 'active',
          created_at: { $gte: since },
          ...scopeFilter,
        },
      },
    },
    {
      $project: {
        title: 1,
        snippet: 1,
        content: 1,
        category: 1,
        impact_note: 1,
        trend_score: 1,
        current_trend_score: 1,
        opportunity_score: 1,
        // The ranking function this feeds still expects an embedding to score against. Projecting it
        // keeps `rankNewsItems` usable unchanged on both paths — the vector path just hands it an
        // already-good shortlist instead of a wide pool.
        embedding: 1,
      },
    },
  ]);
};
