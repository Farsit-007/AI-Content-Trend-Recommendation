// Injects a hypothetical future registry entry alongside the real sources, so the "no drift"
// assertion below also covers a source that doesn't exist in the codebase yet.
jest.mock('../app/modules/NewsRefresh/newsRefresh.fetchers', () => ({
  __esModule: true,
  REFRESHABLE_SOURCES: ['hackernews', 'reddit', 'devto', 'fake_future_source'],
  ENGAGEMENT_FETCHERS: {},
}));

import { hasEngagementSignal } from '../app/modules/NewsIngestion/newsIngestion.scoring';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { engagementSignalClause } from '../app/modules/NewsRetention/newsRetention.service';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { testEmbedding } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const seedNewsItem = (source: string, engagement: { points: number; comments: number; stars_delta: number }) =>
  NewsItem.create({
    source,
    source_id: `id-${Math.random()}`,
    content_hash: `hash-${Math.random()}`,
    title: 'Test item',
    url: `https://example.test/${Math.random()}`,
    embedding: testEmbedding(),
    engagement,
    needs_review: false,
    processed: true,
  });

describe('newsRetention engagementSignalClause vs. hasEngagementSignal', () => {
  it.each([
    ['registry source, zero engagement', 'hackernews', { points: 0, comments: 0, stars_delta: 0 }],
    ['non-registry source, nonzero points', 'rss:example.com', { points: 5, comments: 0, stars_delta: 0 }],
    ['non-registry source, nonzero comments', 'rss:example.com', { points: 0, comments: 3, stars_delta: 0 }],
    ['non-registry source, nonzero stars', 'github_trending', { points: 0, comments: 0, stars_delta: 2 }],
    ['non-registry source, zero engagement', 'rss:example.com', { points: 0, comments: 0, stars_delta: 0 }],
    ['a hypothetical future registry entry, zero engagement', 'fake_future_source', { points: 0, comments: 0, stars_delta: 0 }],
  ])('%s: Mongo predicate agrees with the pure function', async (_label, source, engagement) => {
    const item = await seedNewsItem(source, engagement);

    const jsResult = hasEngagementSignal({ source, engagement });
    const mongoMatch = await NewsItem.exists({ _id: item._id, ...engagementSignalClause });

    expect(Boolean(mongoMatch)).toBe(jsResult);
  });
});
