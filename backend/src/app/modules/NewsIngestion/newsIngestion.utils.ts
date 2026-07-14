import crypto from 'crypto';
import { NewsItem } from '../NewsItem/newsItem.model';
import { RawNewsItem } from './newsIngestion.interface';

export interface HashedNewsItem extends RawNewsItem {
  content_hash: string;
}

export const computeContentHash = (source: string, url: string): string =>
  crypto.createHash('sha256').update(`${source}:${url}`).digest('hex');

export const attachContentHash = (items: RawNewsItem[]): HashedNewsItem[] =>
  items.map((item) => ({ ...item, content_hash: computeContentHash(item.source, item.url) }));

/** Items without a reliable `published_at` are treated as fresh rather than discarded. */
export const filterFresh = (items: HashedNewsItem[], maxAgeHours: number): HashedNewsItem[] => {
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  return items.filter((item) => !item.published_at || item.published_at.getTime() >= cutoff);
};

/**
 * Single batch query against already-stored hashes, plus an in-run Set so the
 * same URL surfacing from two different sources in one run only survives once.
 */
export const dedupeAgainstStored = async (items: HashedNewsItem[]): Promise<HashedNewsItem[]> => {
  const hashes = items.map((item) => item.content_hash);
  const existing = await NewsItem.find({ content_hash: { $in: hashes } }, { content_hash: 1 });
  const existingHashes = new Set(existing.map((doc) => doc.content_hash));

  const seenInRun = new Set<string>();
  const unique: HashedNewsItem[] = [];
  for (const item of items) {
    if (existingHashes.has(item.content_hash) || seenInRun.has(item.content_hash)) continue;
    seenInRun.add(item.content_hash);
    unique.push(item);
  }
  return unique;
};
