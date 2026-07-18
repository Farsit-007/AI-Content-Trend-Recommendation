import crypto from 'crypto';
import { Types } from 'mongoose';
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

/** One recently-stored item, projected wide enough to adjudicate against and (in D3) link to. */
export interface RecentPoolEntry {
  _id: Types.ObjectId;
  embedding: number[];
  title: string;
  snippet?: string;
  published_at?: Date;
  story_id?: Types.ObjectId;
  story_seq?: number;
}

/** Engagement evidence absorbed from a dropped duplicate onto the item it corroborates. */
export interface CorroborationEvidence {
  source: string;
  points: number;
  comments: number;
  url: string;
  at: Date;
}

/** A survivor of semantic dedup, optionally carrying in-run-absorbed corroborations and an
 * adjudication-driven review flag through to the payload build. */
export type DedupSurvivor<T extends EmbeddedNewsItem = EmbeddedNewsItem> = T & {
  corroborations?: CorroborationEvidence[];
  needs_review_adjudication?: boolean;
};

/** The best match a gray-band candidate found — a stored item or an accepted in-run survivor. */
export type GrayMatch =
  | { kind: 'stored'; id: Types.ObjectId; title: string; snippet?: string; published_at?: Date }
  | { kind: 'inrun'; survivor: DedupSurvivor };

export interface GrayPair<T extends EmbeddedNewsItem = EmbeddedNewsItem> {
  candidate: T;
  similarity: number;
  match: GrayMatch;
}

/** Output of the two-band router (D2): definite survivors, hard-duplicate drops against stored
 * items (to corroborate), and gray-band pairs for LLM adjudication. */
export interface SemanticRouting<T extends EmbeddedNewsItem = EmbeddedNewsItem> {
  accepted: DedupSurvivor<T>[];
  hardStoredDrops: { candidate: T; matchId: Types.ObjectId }[];
  grayPairs: GrayPair<T>[];
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

/** Single batch query per run, mirroring `fetchBrandVoicePool`'s pooling pattern. Projected wide
 * (D2) so the router can pick the nearest match and the service can corroborate/link it. */
export const fetchRecentEmbeddings = async (cutoff: Date): Promise<RecentPoolEntry[]> => {
  const recent = await NewsItem.find(
    { published_at: { $gte: cutoff }, lifecycle: { $ne: 'archived' } },
    { embedding: 1, title: 1, snippet: 1, published_at: 1, story_id: 1, story_seq: 1 },
  );
  return recent.map((doc) => ({
    _id: doc._id,
    embedding: doc.embedding,
    title: doc.title,
    snippet: doc.snippet,
    published_at: doc.published_at,
    story_id: (doc as unknown as { story_id?: Types.ObjectId }).story_id,
    story_seq: (doc as unknown as { story_seq?: number }).story_seq,
  }));
};

export const engagementWeight = (item: RawNewsItem): number =>
  item.raw_points + item.raw_comments * 2 + item.raw_stars_delta * 3;

export const evidenceFrom = (item: EmbeddedNewsItem): CorroborationEvidence => ({
  source: item.source,
  points: item.raw_points,
  comments: item.raw_comments,
  url: item.url,
  at: new Date(),
});

/** Missing `published_at` sorts last (treated as newest) — GH scrape items, deep-dive caveat. */
const publishedTime = (d?: Date): number => (d ? d.getTime() : Number.POSITIVE_INFINITY);

/** Keep the higher-engagement copy of an in-run hard-duplicate pair; the loser is absorbed as a
 * corroboration on the winner (deep-dive §3.3 "absorbs instead of discards"). */
const absorbInRunHardDup = <T extends EmbeddedNewsItem>(
  candidate: T,
  winner: DedupSurvivor<T>,
  accepted: DedupSurvivor<T>[],
): void => {
  if (engagementWeight(candidate) > engagementWeight(winner)) {
    const idx = accepted.indexOf(winner);
    const newWinner = candidate as DedupSurvivor<T>;
    newWinner.corroborations = [...(winner.corroborations ?? []), evidenceFrom(winner)];
    if (idx >= 0) accepted[idx] = newWinner;
  } else {
    winner.corroborations = [...(winner.corroborations ?? []), evidenceFrom(candidate)];
  }
};

/**
 * Pure two-band router (D2, design decision 1): classify each candidate by its highest cosine
 * similarity against the recent pool ∪ accepted in-run survivors.
 *  - below `floor` (semantic threshold): accepted unchanged.
 *  - at/above `ceiling` (hard-dup): dropped without an LLM call — corroborate the match (stored
 *    match → `hardStoredDrops`; in-run match → engagement-resolved absorption in place).
 *  - in between: a gray pair for LLM adjudication.
 * Candidates are processed in ascending `published_at` order (missing last) for determinism and so
 * chains (D3) build chronologically. Synchronous and side-effect-free — all writes live in the service.
 */
export const dedupeSemantic = <T extends EmbeddedNewsItem>(
  items: T[],
  recentPool: RecentPoolEntry[],
  floor: number,
  ceiling: number,
): SemanticRouting<T> => {
  const sorted = [...items].sort((a, b) => publishedTime(a.published_at) - publishedTime(b.published_at));
  const accepted: DedupSurvivor<T>[] = [];
  const hardStoredDrops: { candidate: T; matchId: Types.ObjectId }[] = [];
  const grayPairs: GrayPair<T>[] = [];

  for (const item of sorted) {
    let bestSim = -1;
    let bestPool: RecentPoolEntry | undefined;
    let bestInRun: DedupSurvivor<T> | undefined;

    for (const entry of recentPool) {
      const sim = cosineSimilarity(item.embedding, entry.embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestPool = entry;
        bestInRun = undefined;
      }
    }
    for (const surv of accepted) {
      const sim = cosineSimilarity(item.embedding, surv.embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestInRun = surv;
        bestPool = undefined;
      }
    }

    if (bestSim < floor || (!bestPool && !bestInRun)) {
      accepted.push(item);
      continue;
    }

    if (bestSim >= ceiling) {
      if (bestPool) {
        hardStoredDrops.push({ candidate: item, matchId: bestPool._id });
      } else if (bestInRun) {
        absorbInRunHardDup(item, bestInRun, accepted);
      }
      continue;
    }

    // gray band — defer to adjudication (do not accept yet)
    if (bestPool) {
      grayPairs.push({
        candidate: item,
        similarity: bestSim,
        match: { kind: 'stored', id: bestPool._id, title: bestPool.title, snippet: bestPool.snippet, published_at: bestPool.published_at },
      });
    } else if (bestInRun) {
      grayPairs.push({ candidate: item, similarity: bestSim, match: { kind: 'inrun', survivor: bestInRun } });
    }
  }

  return { accepted, hardStoredDrops, grayPairs };
};
