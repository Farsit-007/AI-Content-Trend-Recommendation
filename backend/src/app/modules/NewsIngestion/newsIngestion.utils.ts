import crypto from 'crypto';
import { embedBatch } from '../../lib/embeddings';
import { logger } from '../../lib/logger';
import { cosineSimilarity } from '../../lib/similarity';
import { NewsDedupLedger } from '../NewsDedupLedger/newsDedupLedger.model';
import { NewsItem } from '../NewsItem/newsItem.model';
import { RawNewsItem } from './newsIngestion.interface';

export interface HashedNewsItem extends RawNewsItem {
  content_hash: string;
}

export interface EmbeddedNewsItem extends HashedNewsItem {
  embedding: number[];
}

const EMBED_BATCH_SIZE = 20;

export const computeContentHash = (source: string, url: string): string =>
  crypto.createHash('sha256').update(`${source}:${url}`).digest('hex');

export const attachContentHash = (items: RawNewsItem[]): HashedNewsItem[] =>
  items.map((item) => ({ ...item, content_hash: computeContentHash(item.source, item.url) }));

/** Items without a reliable `published_at` are treated as fresh rather than discarded. */
export const filterFresh = (items: HashedNewsItem[], maxAgeHours: number): HashedNewsItem[] => {
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  return items.filter((item) => !item.published_at || item.published_at.getTime() >= cutoff);
};

/** Own try/catch so a ledger read failure never fails the ingestion run — dedup falls back to
 * stored-item-only in that case (design.md decision 4: fail open on dedup, never on storage). */
const fetchTombstonedHashes = async (hashes: string[]): Promise<Set<string>> => {
  try {
    const tombstoned = await NewsDedupLedger.find({ content_hash: { $in: hashes } }, { content_hash: 1 });
    return new Set(tombstoned.map((doc) => doc.content_hash));
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      '[NewsIngestion] dedup ledger lookup failed — proceeding with stored-item dedup only',
    );
    return new Set();
  }
};

/**
 * Batch queries against already-stored hashes and deleted-item tombstones, plus an in-run Set
 * so the same URL surfacing from two different sources in one run only survives once.
 */
export const dedupeAgainstStored = async (items: HashedNewsItem[]): Promise<HashedNewsItem[]> => {
  const hashes = items.map((item) => item.content_hash);
  const [existing, tombstonedHashes] = await Promise.all([
    NewsItem.find({ content_hash: { $in: hashes } }, { content_hash: 1 }),
    fetchTombstonedHashes(hashes),
  ]);
  const existingHashes = new Set(existing.map((doc) => doc.content_hash));
  for (const hash of tombstonedHashes) existingHashes.add(hash);

  const seenInRun = new Set<string>();
  const unique: HashedNewsItem[] = [];
  for (const item of items) {
    if (existingHashes.has(item.content_hash) || seenInRun.has(item.content_hash)) continue;
    seenInRun.add(item.content_hash);
    unique.push(item);
  }
  return unique;
};

/** Chunks items into `EMBED_BATCH_SIZE`-sized groups, one embeddings call per group (mirrors
 * `categorizeBatch`'s batching). Batches run one at a time rather than via `Promise.all` — a run
 * can produce hundreds of unique items, and firing every batch concurrently still floods
 * OpenRouter enough to trigger intermittent malformed responses under free-tier rate limits. */
export const embedItems = async (items: HashedNewsItem[]): Promise<EmbeddedNewsItem[]> => {
  const embedded: EmbeddedNewsItem[] = [];
  for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
    const batch = items.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(batch.map((item) => `${item.title} ${item.snippet ?? ''}`.trim()));
    batch.forEach((item, j) => embedded.push({ ...item, embedding: vectors[j] }));
  }
  return embedded;
};

/** Single batch query per run, mirroring `fetchBrandVoicePool`'s pooling pattern. */
export const fetchRecentEmbeddings = async (cutoff: Date): Promise<number[][]> => {
  const recent = await NewsItem.find({ published_at: { $gte: cutoff }, lifecycle: { $ne: 'archived' } }, { embedding: 1 });
  return recent.map((doc) => doc.embedding);
};

const engagementWeight = (item: RawNewsItem): number => item.raw_points + item.raw_comments * 2 + item.raw_stars_delta * 3;

/**
 * Greedy pass: an item matching the recently-stored pool is always discarded
 * (something equivalent is already live). An item matching an already-accepted
 * in-run item is resolved by keeping whichever has higher raw engagement.
 */
export const dedupeSemantic = <T extends EmbeddedNewsItem>(items: T[], recentPool: number[][], threshold: number): T[] => {
  const accepted: T[] = [];
  for (const item of items) {
    if (recentPool.length > 0 && Math.max(...recentPool.map((e) => cosineSimilarity(item.embedding, e))) >= threshold) {
      continue;
    }

    let bestMatch = -1;
    let bestSimilarity = 0;
    for (let i = 0; i < accepted.length; i++) {
      const similarity = cosineSimilarity(item.embedding, accepted[i].embedding);
      if (similarity >= threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = i;
      }
    }

    if (bestMatch === -1) {
      accepted.push(item);
    } else if (engagementWeight(item) > engagementWeight(accepted[bestMatch])) {
      accepted[bestMatch] = item;
    }
  }
  return accepted;
};
