jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      producthunt: { client_id: 'test-id', client_secret: 'test-secret' },
    },
  },
}));

import config from '../app/config';
import { redis } from '../app/lib/redis';
import { fetchProductHunt } from '../app/modules/NewsIngestion/adapters/producthunt';

const tokenResponse = (token = `tok-${Math.random()}`): Response => ({ ok: true, json: async () => ({ access_token: token }) }) as Response;

const node = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'p1',
  name: 'Acme',
  tagline: 'The best widget maker',
  url: 'https://producthunt.com/posts/acme',
  votesCount: 312,
  commentsCount: 41,
  createdAt: '2026-07-16T12:00:00.000Z',
  ...overrides,
});

const graphqlResponse = (nodes: ReturnType<typeof node>[]): Response =>
  ({ ok: true, status: 200, json: async () => ({ data: { posts: { edges: nodes.map((n) => ({ node: n })) } } }) }) as Response;

const graphqlEcho = (bodyCapture: { query?: string }, nodes: ReturnType<typeof node>[]) =>
  async (_url: string, init?: RequestInit) => {
    if (init?.body) bodyCapture.query = (JSON.parse(init.body as string) as { query: string }).query;
    return graphqlResponse(nodes);
  };

const graphqlErrorResponse = (message = 'Something went wrong'): Response =>
  ({ ok: true, status: 200, json: async () => ({ errors: [{ message }] }) }) as Response;

const missingDataResponse = (): Response => ({ ok: true, status: 200, json: async () => ({}) }) as Response;

const unauthorized = (): Response => ({ ok: false, status: 401, json: async () => ({}) }) as Response;
const serverError = (): Response => ({ ok: false, status: 500, json: async () => ({}) }) as Response;

describe('fetchProductHunt', () => {
  const originalFetch = global.fetch;
  const originalProducthunt = { ...config.news_ingestion.producthunt };

  beforeEach(async () => {
    await redis.flushall();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    config.news_ingestion.producthunt = { ...originalProducthunt };
  });

  it('maps engagement and enriches the title with the tagline', async () => {
    const fetchMock = jest.fn(async (url: string) => (url.includes('oauth/token') ? tokenResponse() : graphqlResponse([node()])));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchProductHunt();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'producthunt',
      source_id: 'p1',
      title: 'Acme — The best widget maker',
      raw_points: 312,
      raw_comments: 41,
      raw_stars_delta: 0,
      published_at: new Date('2026-07-16T12:00:00.000Z'),
    });
  });

  it('requests the description field and maps it into content', async () => {
    const bodyCapture: { query?: string } = {};
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) =>
      url.includes('oauth/token')
        ? tokenResponse()
        : graphqlEcho(bodyCapture, [node({ description: 'A longer description of Acme.' })])(url, init),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchProductHunt();

    expect(bodyCapture.query).toContain('description');
    expect(items[0].content).toBe('A longer description of Acme.');
  });

  it('leaves content undefined when a node has no description', async () => {
    const fetchMock = jest.fn(async (url: string) => (url.includes('oauth/token') ? tokenResponse() : graphqlResponse([node()])));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchProductHunt();

    expect(items[0].content).toBeUndefined();
  });

  it('caches the app token across two fetchProductHunt() calls', async () => {
    const fetchMock = jest.fn(async (url: string) => (url.includes('oauth/token') ? tokenResponse() : graphqlResponse([node()])));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchProductHunt();
    await fetchProductHunt();

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('retries once with a fresh token after a 401', async () => {
    let graphqlAttempts = 0;
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('oauth/token')) return tokenResponse();
      graphqlAttempts += 1;
      return graphqlAttempts === 1 ? unauthorized() : graphqlResponse([node()]);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchProductHunt();

    expect(items).toHaveLength(1);
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth/token'));
    expect(tokenCalls).toHaveLength(2); // initial token + refresh after the 401
  });

  it('throws without emitting items when the GraphQL response carries an errors array', async () => {
    const fetchMock = jest.fn(async (url: string) => (url.includes('oauth/token') ? tokenResponse() : graphqlErrorResponse('rate limited')));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchProductHunt()).rejects.toThrow('rate limited');
  });

  it('throws when data.posts is missing from an otherwise-200 response', async () => {
    const fetchMock = jest.fn(async (url: string) => (url.includes('oauth/token') ? tokenResponse() : missingDataResponse()));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchProductHunt()).rejects.toThrow('unexpected response shape');
  });

  it('throws on a non-401 GraphQL failure without retrying', async () => {
    const fetchMock = jest.fn(async (url: string) => (url.includes('oauth/token') ? tokenResponse() : serverError()));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchProductHunt()).rejects.toThrow('Product Hunt GraphQL request failed: 500');
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('makes no network calls when credentials are unconfigured', async () => {
    config.news_ingestion.producthunt = { client_id: undefined, client_secret: undefined };
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchProductHunt()).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
