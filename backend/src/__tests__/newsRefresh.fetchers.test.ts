jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      reddit: { client_id: 'test-id', client_secret: 'test-secret', user_agent: 'test-agent' },
    },
  },
}));

jest.mock('../app/modules/NewsIngestion/adapters/reddit', () => ({
  __esModule: true,
  getAppToken: jest.fn().mockResolvedValue('test-token'),
}));

import config from '../app/config';
import { ENGAGEMENT_FETCHERS, REFRESHABLE_SOURCES } from '../app/modules/NewsRefresh/newsRefresh.fetchers';

describe('REFRESHABLE_SOURCES', () => {
  it('registers exactly hackernews, reddit, devto', () => {
    expect([...REFRESHABLE_SOURCES].sort()).toEqual(['devto', 'hackernews', 'reddit']);
  });
});

describe('reddit engagement fetcher', () => {
  const originalFetch = global.fetch;
  const originalReddit = { ...config.news_ingestion.reddit };

  afterEach(() => {
    global.fetch = originalFetch;
    config.news_ingestion.reddit = { ...originalReddit };
  });

  it('batches 150 items into two requests of at most 100 t3_-prefixed fullnames each', async () => {
    const items = Array.from({ length: 150 }, (_, i) => ({ source_id: `p${i}` }));
    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        data: {
          children: new URL(url).searchParams
            .get('id')!
            .split(',')
            .map((fullname) => ({ data: { name: fullname, ups: 10, num_comments: 2 } })),
        },
      }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { results, requestsUsed } = await ENGAGEMENT_FETCHERS.reddit(items);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestsUsed).toBe(2);
    const firstCallUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const firstCallIds = firstCallUrl.searchParams.get('id')!.split(',');
    expect(firstCallIds).toHaveLength(100);
    expect(firstCallIds[0]).toBe('t3_p0');
    expect(results).toHaveLength(150);
  });

  it('maps results back to items by data.name, never by response order', async () => {
    const items = [{ source_id: 'a' }, { source_id: 'b' }];
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { name: 't3_b', ups: 99, num_comments: 1 } },
            { data: { name: 't3_a', ups: 1, num_comments: 0 } },
          ],
        },
      }),
    })) as unknown as typeof fetch;

    const { results } = await ENGAGEMENT_FETCHERS.reddit(items);

    expect(results.find((r) => r.source_id === 'a')).toMatchObject({ points: 1, comments: 0, removed: false });
    expect(results.find((r) => r.source_id === 'b')).toMatchObject({ points: 99, comments: 1, removed: false });
  });

  it('marks an item missing from the listing response as removed', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: { children: [] } }),
    })) as unknown as typeof fetch;

    const { results } = await ENGAGEMENT_FETCHERS.reddit([{ source_id: 'gone' }]);

    expect(results).toEqual([{ source_id: 'gone', points: 0, comments: 0, stars_delta: 0, removed: true }]);
  });

  it('skips entirely and makes no request when credentials are unconfigured', async () => {
    config.news_ingestion.reddit = { client_id: undefined, client_secret: undefined, user_agent: 'test-agent' };
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { results, requestsUsed } = await ENGAGEMENT_FETCHERS.reddit([{ source_id: 'x' }]);

    expect(results).toEqual([]);
    expect(requestsUsed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
