import { fetchLobsters } from '../app/modules/NewsIngestion/adapters/lobsters';

const jsonResponse = (body: unknown): Response => ({ ok: true, json: async () => body }) as Response;
const failedResponse = (status: number): Response => ({ ok: false, status, json: async () => [] }) as Response;

const story = (overrides: Partial<Record<string, unknown>> = {}) => ({
  short_id: 'abc123',
  title: 'A great story',
  url: 'https://example.com/article',
  comments_url: 'https://lobste.rs/s/abc123/a_great_story',
  created_at: '2026-07-15T12:00:00.000Z',
  score: 10,
  comment_count: 3,
  description: undefined,
  tags: [],
  ...overrides,
});

describe('fetchLobsters', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps engagement signals onto raw_points and raw_comments', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([story({ score: 42, comment_count: 7 })]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchLobsters();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'lobsters',
      source_id: 'abc123',
      raw_points: 42,
      raw_comments: 7,
      raw_stars_delta: 0,
      published_at: new Date('2026-07-15T12:00:00.000Z'),
    });
  });

  it('falls back to comments_url when the story has no external url', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([story({ url: '' })]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchLobsters();

    expect(items[0].url).toBe('https://lobste.rs/s/abc123/a_great_story');
  });

  it('strips HTML and decodes entities in the description for the snippet', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse([story({ description: '<p>Tom &amp; Jerry&#39;s <b>excellent</b> adventure</p>' })]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchLobsters();

    expect(items[0].snippet).toBe("Tom & Jerry's excellent adventure");
  });

  it('falls back to tags as the snippet when there is no description', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([story({ description: undefined, tags: ['ai', 'web'] })]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchLobsters();

    expect(items[0].snippet).toBe('ai web');
  });

  it('stores the full uncapped description as content while snippet stays capped at 500 characters', async () => {
    const longDescription = `<p>${'y'.repeat(600)}</p>`;
    const fetchMock = jest.fn(async () => jsonResponse([story({ description: longDescription })]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchLobsters();

    expect(items[0].snippet).toHaveLength(500);
    expect(items[0].content).toHaveLength(600);
  });

  it('leaves content undefined when there is no description', async () => {
    const fetchMock = jest.fn(async () => jsonResponse([story({ description: undefined, tags: ['ai'] })]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchLobsters();

    expect(items[0].content).toBeUndefined();
  });

  it('throws when the hottest endpoint returns a non-OK status', async () => {
    const fetchMock = jest.fn(async () => failedResponse(500));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchLobsters()).rejects.toThrow('Lobsters request failed: 500');
  });
});
