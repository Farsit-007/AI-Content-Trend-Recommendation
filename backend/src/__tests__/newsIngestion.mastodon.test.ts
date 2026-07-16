jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      mastodon_instances: ['mastodon.social', 'fosstodon.org'],
    },
  },
}));

import config from '../app/config';
import { fetchMastodon } from '../app/modules/NewsIngestion/adapters/mastodon';

const trendsResponse = (links: unknown[]): Response => ({ ok: true, json: async () => links }) as Response;
const failedResponse = (status: number): Response => ({ ok: false, status, json: async () => [] }) as Response;

const link = (overrides: Partial<Record<string, unknown>> = {}) => ({
  url: 'https://example.com/article',
  title: 'A trending article',
  description: undefined,
  history: [{ day: '1690000000', accounts: '10', uses: '15' }],
  ...overrides,
});

describe('fetchMastodon', () => {
  const originalFetch = global.fetch;
  const originalInstances = [...config.news_ingestion.mastodon_instances];

  afterEach(() => {
    global.fetch = originalFetch;
    config.news_ingestion.mastodon_instances = [...originalInstances];
  });

  it('coerces the string accounts count into raw_points and sets a fetch-time published_at', async () => {
    const before = Date.now();
    const fetchMock = jest.fn(async (url: string) =>
      url.includes('mastodon.social') ? trendsResponse([link({ history: [{ accounts: '57', uses: '80' }] })]) : trendsResponse([]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchMastodon();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'mastodon',
      source_id: 'https://example.com/article',
      raw_points: 57,
      raw_comments: 0,
      raw_stars_delta: 0,
    });
    expect(items[0].published_at!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('dedupes the same URL trending on two instances, keeping the higher sharer count', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      url.includes('mastodon.social')
        ? trendsResponse([link({ history: [{ accounts: '40' }] })])
        : trendsResponse([link({ history: [{ accounts: '25' }] })]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchMastodon();

    expect(items).toHaveLength(1);
    expect(items[0].raw_points).toBe(40);
  });

  it('returns the surviving instance items when one instance is down', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      url.includes('mastodon.social') ? failedResponse(500) : trendsResponse([link()]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchMastodon();

    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://example.com/article');
  });

  it('throws when every configured instance fails', async () => {
    const fetchMock = jest.fn(async () => failedResponse(500));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchMastodon()).rejects.toThrow('Mastodon: all instances failed');
  });

  it('returns zero items without error when a small instance legitimately has no trends', async () => {
    const fetchMock = jest.fn(async () => trendsResponse([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchMastodon();

    expect(items).toEqual([]);
  });

  it('throws without making any network call when no instances are configured', async () => {
    config.news_ingestion.mastodon_instances = [];
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchMastodon()).rejects.toThrow('mastodon not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips HTML from the description into the snippet', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      url.includes('mastodon.social') ? trendsResponse([link({ description: '<p>Great <b>read</b></p>' })]) : trendsResponse([]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchMastodon();

    expect(items[0].snippet).toBe('Great read');
  });
});
