import { Types } from 'mongoose';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { NewsItem } from './newsItem.model';

const VECTOR_INDEX_NAME = 'news_items_vector_index';
/** A team's brand-voice pool is typically small (a handful of examples); capping how many drive a
 *  separate $vectorSearch query each bounds worst-case cost without meaningfully narrowing recall
 *  for any real team. */
const MAX_BRAND_VOICE_QUERY_VECTORS = 5;
const NUM_CANDIDATES = 150;

export interface SemanticMatchCandidate {
  _id: string;
  similarity_score: number;
}

/**
 * Finds items semantically close to any of a team's brand-voice examples, excluding items whose
 * category or category_group already matches the team's subscription (those are already surfaced
 * by the primary exact/broad-group match) and any other id the caller wants excluded.
 *
 * One $vectorSearch query per brand-voice example (not a single averaged/centroid vector) to
 * mirror `scoreRelevance`'s existing "max similarity across the pool" semantics — a team whose
 * brand voice spans two distinct topics (e.g. AI and career advice) is served correctly by this,
 * where a single averaged vector would represent neither topic well.
 *
 * Isolated in its own module so it's a clean mock boundary for tests: $vectorSearch is Atlas
 * Vector Search, which has no equivalent in `mongodb-memory-server` (this repo's Jest test
 * database) — it cannot be exercised by an integration test the way a plain `find()` can. Callers
 * are expected to wrap this in a try/catch (see newsItem.service.ts) — a missing/misconfigured
 * index throws, and the semantic tier is a supplementary nice-to-have, never a hard requirement.
 */
export const findSemanticallyRelevantItems = async (
  teamId: string,
  excludeCategoryOrGroup: string[],
  excludeIds: string[],
  limit: number,
  minSimilarity: number,
): Promise<SemanticMatchCandidate[]> => {
  if (limit <= 0) return [];

  const brandVoiceExamples = await BrandVoiceExample.find({ team_id: teamId })
    .select('embedding')
    .limit(MAX_BRAND_VOICE_QUERY_VECTORS)
    .lean();
  if (brandVoiceExamples.length === 0) return [];

  const excludeObjectIds = excludeIds.map((id) => new Types.ObjectId(id));
  const bestScoreById = new Map<string, number>();

  for (const example of brandVoiceExamples) {
    const candidates = await NewsItem.aggregate<{ _id: Types.ObjectId; similarity_score: number }>([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: example.embedding,
          numCandidates: NUM_CANDIDATES,
          limit,
        },
      },
      {
        $match: {
          lifecycle: { $ne: 'archived' },
          category: { $nin: excludeCategoryOrGroup },
          category_group: { $nin: excludeCategoryOrGroup },
          _id: { $nin: excludeObjectIds },
        },
      },
      { $addFields: { similarity_score: { $meta: 'vectorSearchScore' } } },
      { $match: { similarity_score: { $gte: minSimilarity } } },
      { $project: { _id: 1, similarity_score: 1 } },
    ]);

    for (const candidate of candidates) {
      const idStr = candidate._id.toString();
      const existing = bestScoreById.get(idStr);
      if (existing === undefined || candidate.similarity_score > existing) {
        bestScoreById.set(idStr, candidate.similarity_score);
      }
    }
  }

  return [...bestScoreById.entries()]
    .map(([_id, similarity_score]) => ({ _id, similarity_score }))
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
};
