jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      reddit_subreddits: ['programming', 'technology'],
      reddit: { client_id: 'test-id', client_secret: 'test-secret', user_agent: 'test-agent' },
    },
  },
}));

import config from '../app/config';
import { redis } from '../app/lib/redis';
import { fetchReddit } from '../app/modules/NewsIngestion/adapters/reddit';

const tokenResponse = (token = `tok-${Math.random()}`, expires_in = 3600): Response =>
  ({ ok: true, json: async () => ({ access_token: token, expires_in }) }) as Response;

const listingResponse = (subreddit: string, postIds: string[] = ['p1'], overrides: Partial<Record<string, unknown>> = {}): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        children: postIds.map((id) => ({
          data: { id, title: `${subreddit} post ${id}`, permalink: `/r/${subreddit}/${id}`, ...overrides },
        })),
      },
    }),
  }) as Response;

const unauthorized = (): Response => ({ ok: false, status: 401, json: async () => ({}) }) as Response;
const serverError = (): Response => ({ ok: false, status: 500, json: async () => ({}) }) as Response;

describe('fetchReddit', () => {
  const originalFetch = global.fetch;
  const originalReddit = { ...config.news_ingestion.reddit };
  const originalSubreddits = [...config.news_ingestion.reddit_subreddits];

  beforeEach(async () => {
    await redis.flushall();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    config.news_ingestion.reddit = { ...originalReddit };
    config.news_ingestion.reddit_subreddits = [...originalSubreddits];
  });

  it('caches the app token across two fetchReddit() calls', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('access_token')) return tokenResponse();
      const subreddit = url.includes('/r/programming/') ? 'programming' : 'technology';
      return listingResponse(subreddit);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchReddit();
    await fetchReddit();

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('access_token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('retries once with a fresh token after a 401', async () => {
    config.news_ingestion.reddit_subreddits = ['programming'];
    let listingAttempts = 0;
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('access_token')) return tokenResponse();
      listingAttempts += 1;
      return listingAttempts === 1 ? unauthorized() : listingResponse('programming');
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchReddit();

    expect(items).toHaveLength(1);
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('access_token'));
    expect(tokenCalls).toHaveLength(2); // initial token + refresh after the 401
  });

  it('makes no network calls when credentials are unconfigured', async () => {
    config.news_ingestion.reddit = { client_id: undefined, client_secret: undefined, user_agent: 'test-agent' };
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchReddit()).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores the full selftext as content while snippet stays sliced to 500 characters', async () => {
    config.news_ingestion.reddit_subreddits = ['programming'];
    const longText = 'x'.repeat(600);
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('access_token')) return tokenResponse();
      return listingResponse('programming', ['p1'], { selftext: longText });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchReddit();

    expect(items).toHaveLength(1);
    expect(items[0].snippet).toHaveLength(500);
    expect(items[0].content).toBe(longText);
    expect(items[0].content).toHaveLength(600);
  });

  it('returns items from the other subreddits when one fails', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('access_token')) return tokenResponse();
      if (url.includes('/r/technology/')) return serverError();
      return listingResponse('programming');
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchReddit();

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('programming post p1');
  });

  it('resolves url to the real external link for a link-post, with the permalink as discussion_url', async () => {
    config.news_ingestion.reddit_subreddits = ['programming'];
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('access_token')) return tokenResponse();
      return listingResponse('programming', ['p1'], { url: 'https://example.test/real-article', is_self: false });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchReddit();

    expect(items[0].url).toBe('https://example.test/real-article');
    expect(items[0].discussion_url).toBe('https://www.reddit.com/r/programming/p1');
  });

  it('resolves url and discussion_url to the same Reddit thread for a genuine self-post', async () => {
    config.news_ingestion.reddit_subreddits = ['programming'];
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('access_token')) return tokenResponse();
      return listingResponse('programming', ['p1'], { is_self: true, url: 'https://www.reddit.com/r/programming/p1' });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchReddit();

    expect(items[0].url).toBe('https://www.reddit.com/r/programming/p1');
    expect(items[0].discussion_url).toBe('https://www.reddit.com/r/programming/p1');
  });

  it('captures a real thumbnail URL but filters out Reddit\'s non-URL sentinel values', async () => {
    config.news_ingestion.reddit_subreddits = ['programming'];
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('access_token')) return tokenResponse();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            children: [
              { data: { id: 'p1', title: 'has real thumb', permalink: '/r/programming/p1', thumbnail: 'https://b.thumbs.redditmedia.com/abc.jpg' } },
              { data: { id: 'p2', title: 'self sentinel', permalink: '/r/programming/p2', thumbnail: 'self' } },
              { data: { id: 'p3', title: 'no thumb', permalink: '/r/programming/p3', thumbnail: 'default' } },
            ],
          },
        }),
      } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchReddit();

    expect(items.find((i) => i.title === 'has real thumb')?.thumbnail_url).toBe('https://b.thumbs.redditmedia.com/abc.jpg');
    expect(items.find((i) => i.title === 'self sentinel')?.thumbnail_url).toBeUndefined();
    expect(items.find((i) => i.title === 'no thumb')?.thumbnail_url).toBeUndefined();
  });
});
