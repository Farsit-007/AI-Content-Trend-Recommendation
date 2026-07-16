jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      stackexchange_key: undefined,
    },
  },
}));

import config from '../app/config';
import { fetchStackOverflow } from '../app/modules/NewsIngestion/adapters/stackoverflow';

const questionsResponse = (items: unknown[], extra: Record<string, unknown> = {}): Response =>
  ({ ok: true, json: async () => ({ items, ...extra }) }) as Response;

const errorResponse = (error_message: string, status = 400): Response =>
  ({ ok: false, status, json: async () => ({ error_id: 400, error_message }) }) as Response;

const question = (overrides: Partial<Record<string, unknown>> = {}) => ({
  question_id: 42,
  title: 'Why doesn&#39;t useEffect fire?',
  link: 'https://stackoverflow.com/questions/42/why-doesnt-useeffect-fire',
  tags: ['javascript', 'react', 'hooks'],
  creation_date: 1752600000,
  score: 18,
  answer_count: 4,
  ...overrides,
});

describe('fetchStackOverflow', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    config.news_ingestion.stackexchange_key = undefined;
  });

  it('decodes HTML entities in the title and maps engagement', async () => {
    const fetchMock = jest.fn(async () => questionsResponse([question()]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchStackOverflow();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'stackoverflow',
      source_id: '42',
      title: "Why doesn't useEffect fire?",
      snippet: 'javascript, react, hooks',
      raw_points: 18,
      raw_comments: 4,
      raw_stars_delta: 0,
      published_at: new Date(1752600000 * 1000),
    });
  });

  it('requests without a key parameter when STACKEXCHANGE_KEY is unset', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expect(url).not.toContain('&key=');
      return questionsResponse([question()]);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchStackOverflow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('appends the key parameter when STACKEXCHANGE_KEY is configured', async () => {
    config.news_ingestion.stackexchange_key = 'test-key';
    const fetchMock = jest.fn(async (url: string) => {
      expect(url).toContain('&key=test-key');
      return questionsResponse([question()]);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchStackOverflow();
  });

  it('throws with the API error message on an error_id/error_message response', async () => {
    const fetchMock = jest.fn(async () => errorResponse('access_token expired'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchStackOverflow()).rejects.toThrow('access_token expired');
  });

  it('throws when items is missing or not an array', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchStackOverflow()).rejects.toThrow('Stack Exchange request failed');
  });

  it('logs a warning but does not throw or delay when the response carries a backoff field', async () => {
    const fetchMock = jest.fn(async () => questionsResponse([question()], { backoff: 10 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const start = Date.now();
    const items = await fetchStackOverflow();

    expect(items).toHaveLength(1);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
