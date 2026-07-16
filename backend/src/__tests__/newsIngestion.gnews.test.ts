jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      gnews: { api_key: 'test-key', queries: ['AI regulation'] },
    },
  },
}));

import config from '../app/config';
import { fetchGNews } from '../app/modules/NewsIngestion/adapters/gnews';

const searchResponse = (articles: unknown[]): Response => ({ ok: true, status: 200, json: async () => ({ articles }) }) as Response;
const errorResponse = (errors: string[], status = 403): Response => ({ ok: false, status, json: async () => ({ errors }) }) as Response;

const article = (overrides: Partial<Record<string, unknown>> = {}) => ({
  title: 'AI regulation bill passes',
  description: 'A summary of the bill',
  url: 'https://www.example-news.com/article',
  publishedAt: '2026-07-16T12:00:00Z',
  ...overrides,
});

describe('fetchGNews', () => {
  const originalFetch = global.fetch;
  const originalGnews = { ...config.news_ingestion.gnews };

  afterEach(() => {
    global.fetch = originalFetch;
    config.news_ingestion.gnews = { ...originalGnews, queries: [...originalGnews.queries] };
  });

  it('maps the article using the API-provided url directly, with no canonicalization', async () => {
    const fetchMock = jest.fn(async () => searchResponse([article()]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGNews();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'gnews',
      source_id: 'https://www.example-news.com/article',
      url: 'https://www.example-news.com/article',
      title: 'AI regulation bill passes',
      snippet: 'A summary of the bill',
      raw_points: 0,
      raw_comments: 0,
      raw_stars_delta: 0,
      published_at: new Date('2026-07-16T12:00:00Z'),
    });
  });

  it('slices the query list to 3 topics', async () => {
    config.news_ingestion.gnews.queries = ['a', 'b', 'c', 'd', 'e'];
    const fetchMock = jest.fn(async () => searchResponse([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchGNews();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('makes no network calls when the API key is unset', async () => {
    config.news_ingestion.gnews.api_key = undefined;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchGNews()).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no network calls when no topics are configured', async () => {
    config.news_ingestion.gnews.queries = [];
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchGNews()).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the surviving query results when one query fails', async () => {
    config.news_ingestion.gnews.queries = ['broken', 'good'];
    const fetchMock = jest.fn(async (url: string) =>
      url.includes('q=broken') ? errorResponse(['quota exceeded']) : searchResponse([article()]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGNews();

    expect(items).toHaveLength(1);
  });

  it('throws surfacing the errors body when every query fails', async () => {
    const fetchMock = jest.fn(async () => errorResponse(['invalid api key']));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchGNews()).rejects.toThrow('invalid api key');
  });
});
