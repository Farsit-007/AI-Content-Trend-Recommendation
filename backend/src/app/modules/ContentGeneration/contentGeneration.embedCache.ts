import crypto from 'crypto';
import { embedForTask, resolveModelForTask } from '../../lib/modelResolution';
import { redis } from '../../lib/redis';

const TOPIC_EMBED_CACHE_TTL_SECONDS = 604800; // 7 days — mirrors the fact-sheet cache's TTL.

const topicEmbedCacheKey = (topic: string, modelId: string): string =>
  `embed:topic:${crypto.createHash('sha256').update(topic).digest('hex')}:${modelId}`;

/**
 * Redis-shared wrapper for the manual-topic embedding call (no news_item_id — item embeddings are
 * already stored on the item, so this only matters for the manual-topic path). Keyed by the
 * resolved embedding model id so a model change can never serve a vector produced by a different
 * model — resolution itself is cheap (DB reads, no network call), so re-resolving here purely to
 * read `model_id` before deciding cache hit/miss is a non-issue; the expensive part (the actual
 * embedding call) only happens on a genuine miss via the existing failover-safe `embedForTask`.
 */
export const getOrEmbedTopic = async (topic: string, teamId: string): Promise<number[]> => {
  const resolved = await resolveModelForTask('embedding', { teamId });
  const key = topicEmbedCacheKey(topic, resolved.model_id);

  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached) as number[];
  }

  const vector = await embedForTask('embedding', topic, { teamId });
  await redis.setex(key, TOPIC_EMBED_CACHE_TTL_SECONDS, JSON.stringify(vector));
  return vector;
};
