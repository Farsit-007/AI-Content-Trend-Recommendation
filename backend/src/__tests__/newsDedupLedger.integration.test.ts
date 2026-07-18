import config from '../app/config';
import { HashedNewsItem, dedupeAgainstStored } from '../app/modules/NewsIngestion/newsIngestion.utils';
import { NewsDedupLedger } from '../app/modules/NewsDedupLedger/newsDedupLedger.model';
import { recordTombstones } from '../app/modules/NewsDedupLedger/newsDedupLedger.service';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { NewsItemService } from '../app/modules/NewsItem/newsItem.service';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { testEmbedding } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const seedNewsItem = (overrides: Partial<Parameters<typeof NewsItem.create>[0]> = {}) =>
  NewsItem.create({
    source: 'github_trending',
    source_id: `gh-${Math.random()}`,
    content_hash: `hash-${Math.random()}`,
    title: 'A trending repo',
    url: `https://example.test/${Math.random()}`,
    embedding: testEmbedding(),
    needs_review: false,
    processed: true,
    ...overrides,
  });

const hashedCandidate = (content_hash: string): HashedNewsItem => ({
  source: 'github_trending',
  source_id: 'candidate',
  content_hash,
  title: 'Same repo, re-fetched',
  url: 'https://example.test/candidate',
  raw_points: 0,
  raw_comments: 0,
  raw_stars_delta: 0,
});

describe('recordTombstones', () => {
  it('is idempotent on a duplicate content_hash', async () => {
    const item = { content_hash: 'dup-hash', title: 'A', source: 'hackernews' };

    await recordTombstones([item]);
    await expect(recordTombstones([item])).resolves.not.toThrow();

    expect(await NewsDedupLedger.countDocuments({ content_hash: 'dup-hash' })).toBe(1);
  });

  it('rethrows a non-duplicate-key error', async () => {
    jest.spyOn(NewsDedupLedger, 'insertMany').mockRejectedValueOnce(new Error('connection reset'));

    await expect(recordTombstones([{ content_hash: 'x', title: 'A', source: 'hackernews' }])).rejects.toThrow(
      'connection reset',
    );
  });

  it('no-ops on an empty array', async () => {
    await expect(recordTombstones([])).resolves.toBeUndefined();
    expect(await NewsDedupLedger.countDocuments({})).toBe(0);
  });
});

describe('dedupeAgainstStored with the tombstone ledger', () => {
  it('drops a candidate whose hash matches a ledger tombstone even with no live row', async () => {
    await recordTombstones([{ content_hash: 'tombstoned-hash', title: 'Gone', source: 'github_trending' }]);

    const result = await dedupeAgainstStored([hashedCandidate('tombstoned-hash')]);

    expect(result).toHaveLength(0);
  });

  it('still drops a candidate matching a live stored item with no ledger tombstone (regression guard)', async () => {
    const item = await seedNewsItem({ content_hash: 'live-hash' });

    const result = await dedupeAgainstStored([hashedCandidate(item.content_hash)]);

    expect(result).toHaveLength(0);
  });

  it('lets a genuinely new candidate through when neither store nor ledger has its hash', async () => {
    const result = await dedupeAgainstStored([hashedCandidate('brand-new-hash')]);

    expect(result).toHaveLength(1);
    expect(result[0].content_hash).toBe('brand-new-hash');
  });

  it('fails open (stored-item dedup only) when the ledger query rejects', async () => {
    const item = await seedNewsItem({ content_hash: 'live-hash-2' });
    jest.spyOn(NewsDedupLedger, 'find').mockImplementationOnce(() => {
      throw new Error('ledger unavailable');
    });

    const result = await dedupeAgainstStored([hashedCandidate(item.content_hash), hashedCandidate('new-hash-2')]);

    // The live item's hash is still caught by the stored-item query; only the ledger check degraded.
    expect(result.map((r) => r.content_hash)).toEqual(['new-hash-2']);
  });
});

describe('deleteNewsItem tombstones before deleting', () => {
  it('writes a ledger row that then blocks re-ingestion of the same hash', async () => {
    const item = await seedNewsItem({ content_hash: 'deleted-item-hash' });

    const deleted = await NewsItemService.deleteNewsItem(item._id.toString());
    expect(deleted).not.toBeNull();

    const ledgerRow = await NewsDedupLedger.findOne({ content_hash: 'deleted-item-hash' });
    expect(ledgerRow).not.toBeNull();

    const result = await dedupeAgainstStored([hashedCandidate('deleted-item-hash')]);
    expect(result).toHaveLength(0);
  });

  it('returns null and writes no tombstone for a non-existent id', async () => {
    const insertSpy = jest.spyOn(NewsDedupLedger, 'insertMany');

    const result = await NewsItemService.deleteNewsItem('64b000000000000000000000');

    expect(result).toBeNull();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe('news_dedup_ledger TTL index', () => {
  it('exists with expireAfterSeconds matching NEWS_DEDUP_LEDGER_TTL_DAYS', async () => {
    const indexes = await NewsDedupLedger.collection.indexes();
    const ttlIndex = indexes.find((idx) => idx.key && idx.key.deleted_at === 1 && typeof idx.expireAfterSeconds === 'number');

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(config.news_ingestion.dedup_ledger_ttl_days * 86400);
  });
});
