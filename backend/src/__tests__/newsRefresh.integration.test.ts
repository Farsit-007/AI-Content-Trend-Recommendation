import config from '../app/config';
import { redis } from '../app/lib/redis';
import { MaintenanceRun } from '../app/modules/MaintenanceRun/maintenanceRun.model';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { runEngagementRefresh } from '../app/modules/NewsRefresh/newsRefresh.service';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';
import { testEmbedding } from './support/fixtures';

beforeAll(connectTestDb);
afterEach(async () => {
  await clearTestDb();
  await redis.flushall();
});
afterAll(disconnectTestDb);

const seedNewsItem = (overrides: Partial<Parameters<typeof NewsItem.create>[0]> = {}) =>
  NewsItem.create({
    source: 'hackernews',
    source_id: 'hn1',
    content_hash: `hash-${Math.random()}`,
    title: 'Test story',
    url: `https://example.test/${Math.random()}`,
    embedding: testEmbedding(),
    engagement: { points: 1, comments: 1, stars_delta: 0 },
    trend_score: 1,
    needs_review: false,
    processed: true,
    created_at: new Date(),
    ...overrides,
  });

const mockFetchByUrl = (handlers: Record<string, Response | (() => Response)>) => {
  global.fetch = jest.fn(async (url: string) => {
    for (const [match, handler] of Object.entries(handlers)) {
      if (url.includes(match)) return typeof handler === 'function' ? handler() : handler;
    }
    throw new Error(`Unmocked fetch call: ${url}`);
  }) as unknown as typeof fetch;
};

const okJson = (body: unknown): Response => ({ ok: true, status: 200, json: async () => body }) as Response;
const notFound = (): Response => ({ ok: false, status: 404, json: async () => ({}) }) as Response;

describe('runEngagementRefresh', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('refreshes engagement, appends history (with an ingest-time first snapshot), and sets engagement_refreshed_at', async () => {
    const item = await seedNewsItem({ source: 'hackernews', source_id: 'hn1', engagement: { points: 1, comments: 1, stars_delta: 0 } });
    mockFetchByUrl({ 'hacker-news.firebaseio.com': okJson({ score: 50, descendants: 10 }) });

    await runEngagementRefresh();

    const refreshed = await NewsItem.findById(item._id).lean();
    expect(refreshed?.engagement).toMatchObject({ points: 50, comments: 10, stars_delta: 0 });
    expect(refreshed?.engagement_refreshed_at).toBeInstanceOf(Date);
    expect(refreshed?.engagement_history).toHaveLength(2);
    expect(refreshed?.engagement_history?.[0]).toMatchObject({ points: 1, comments: 1 });
    expect(refreshed?.engagement_history?.[1]).toMatchObject({ points: 50, comments: 10 });
  });

  it('sets source_removed on a 404 and does not delete the item, and still recomputes current_trend_score', async () => {
    const item = await seedNewsItem({ source: 'devto', source_id: 'dev-gone', engagement: { points: 5, comments: 2, stars_delta: 0 } });
    mockFetchByUrl({ 'dev.to/api/articles': notFound() });

    await runEngagementRefresh();

    const refreshed = await NewsItem.findById(item._id).lean();
    expect(refreshed).not.toBeNull();
    expect(refreshed?.source_removed).toBe(true);
    expect(refreshed?.current_trend_score).toBeDefined();
  });

  it('current_trend_score strictly decreases across two refresh cycles with static (unchanging) engagement', async () => {
    const item = await seedNewsItem({ source: 'hackernews', source_id: 'hn1', engagement: { points: 10, comments: 5, stars_delta: 0 } });
    mockFetchByUrl({ 'hacker-news.firebaseio.com': okJson({ score: 10, descendants: 5 }) });

    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    try {
      jest.setSystemTime(new Date());
      await runEngagementRefresh();
      const afterFirst = await NewsItem.findById(item._id).lean();

      await redis.flushall(); // release the lock explicitly rather than relying on mocked TTL expiry
      jest.setSystemTime(new Date(Date.now() + 5 * 60 * 60 * 1000));
      await runEngagementRefresh();
      const afterSecond = await NewsItem.findById(item._id).lean();

      expect(afterSecond?.current_trend_score).toBeLessThan(afterFirst?.current_trend_score as number);
    } finally {
      jest.useRealTimers();
    }
  });

  it('backfills current_trend_score for out-of-window rows lacking it, leaving already-set rows untouched', async () => {
    const outsideWindow = new Date(Date.now() - (config.news_ingestion.refresh.window_hours + 10) * 60 * 60 * 1000);
    const unscored = await seedNewsItem({
      source: 'hackernews',
      source_id: 'old-unscored',
      trend_score: 3.5,
      created_at: outsideWindow,
    });
    const alreadyScored = await seedNewsItem({
      source: 'hackernews',
      source_id: 'old-already-scored',
      content_hash: `hash-${Math.random()}`,
      trend_score: 3.5,
      current_trend_score: 9.9,
      created_at: outsideWindow,
    });

    await runEngagementRefresh(); // neither item is a refresh candidate (both outside the window) — no fetch needed

    const backfilled = await NewsItem.findById(unscored._id).lean();
    const untouched = await NewsItem.findById(alreadyScored._id).lean();

    expect(backfilled?.current_trend_score).toBe(3.5);
    expect(untouched?.current_trend_score).toBe(9.9);
  });

  it('caps engagement_history at the most recent 32 snapshots', async () => {
    const existingHistory = Array.from({ length: 32 }, (_, i) => ({
      at: new Date(Date.now() - i * 60 * 60 * 1000),
      points: i,
      comments: i,
      stars_delta: 0,
    }));
    const item = await seedNewsItem({ source: 'devto', source_id: 'dev-old', engagement_history: existingHistory });
    mockFetchByUrl({ 'dev.to/api/articles': okJson({ public_reactions_count: 999, comments_count: 1 }) });

    await runEngagementRefresh();

    const refreshed = await NewsItem.findById(item._id).lean();
    expect(refreshed?.engagement_history).toHaveLength(32);
    expect(refreshed?.engagement_history?.[31]).toMatchObject({ points: 999, comments: 1 });
  });

  it('persists a maintenance_runs document with consistent counts', async () => {
    await seedNewsItem({ source: 'hackernews', source_id: 'hn1' });
    await seedNewsItem({ source: 'devto', source_id: 'dev-gone', content_hash: `hash-${Math.random()}` });
    mockFetchByUrl({
      'hacker-news.firebaseio.com': okJson({ score: 5, descendants: 1 }),
      'dev.to/api/articles': notFound(),
    });

    await runEngagementRefresh();

    const runs = await MaintenanceRun.find({ job: 'engagement_refresh' }).lean();
    expect(runs).toHaveLength(1);
    expect(runs[0].counts).toMatchObject({ candidates: 2, refreshed: 1, source_removed: 1 });
  });

  it('exits without fetching or writing anything when the lock is already held', async () => {
    const item = await seedNewsItem({ source: 'hackernews', source_id: 'hn1' });
    await redis.set('lock:news_refresh', 'held-by-another-run', 'PX', 60_000, 'NX');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await runEngagementRefresh();

    expect(fetchMock).not.toHaveBeenCalled();
    const unchanged = await NewsItem.findById(item._id).lean();
    expect(unchanged?.engagement_refreshed_at).toBeUndefined();
    expect(await MaintenanceRun.countDocuments({ job: 'engagement_refresh' })).toBe(0);
  });
});
