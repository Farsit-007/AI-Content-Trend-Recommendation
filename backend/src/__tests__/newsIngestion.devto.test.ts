import { fetchDevTo } from '../app/modules/NewsIngestion/adapters/devto';

const jsonResponse = (body: unknown): Response => ({ ok: true, json: async () => body }) as Response;
const failedResponse = (status: number): Response => ({ ok: false, status, json: async () => [] }) as Response;

const topArticle = (id: number, title = `Top article ${id}`, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  title,
  url: `https://dev.to/article-${id}`,
  description: 'desc',
  published_at: new Date().toISOString(),
  public_reactions_count: 10,
  comments_count: 2,
  ...overrides,
});

describe('fetchDevTo', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('merges the top and rising responses and dedupes by article id', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('top=1')) return jsonResponse([topArticle(1), topArticle(2)]);
      if (url.includes('state=rising')) return jsonResponse([topArticle(2, 'Rising duplicate of 2'), topArticle(3)]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchDevTo();

    expect(items.map((i) => i.source_id).sort()).toEqual(['1', '2', '3']);
  });

  it('returns the rising articles when the top request fails', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('top=1')) return failedResponse(500);
      if (url.includes('state=rising')) return jsonResponse([topArticle(5)]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchDevTo();

    expect(items).toHaveLength(1);
    expect(items[0].source_id).toBe('5');
  });

  it('throws when both the top and rising requests fail', async () => {
    const fetchMock = jest.fn(async () => failedResponse(500));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchDevTo()).rejects.toThrow('both top and rising requests failed');
  });

  it('prefers cover_image for thumbnail_url when present', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('top=1')) return jsonResponse([topArticle(1, undefined, { cover_image: 'https://dev.to/cover.png', social_image: 'https://dev.to/social.png' })]);
      if (url.includes('state=rising')) return jsonResponse([]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchDevTo();

    expect(items[0].thumbnail_url).toBe('https://dev.to/cover.png');
  });

  it('falls back to social_image when there is no cover_image', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('top=1')) return jsonResponse([topArticle(1, undefined, { cover_image: undefined, social_image: 'https://dev.to/social.png' })]);
      if (url.includes('state=rising')) return jsonResponse([]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchDevTo();

    expect(items[0].thumbnail_url).toBe('https://dev.to/social.png');
  });

  it('leaves thumbnail_url undefined when neither cover_image nor social_image is present', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('top=1')) return jsonResponse([topArticle(1, undefined, { cover_image: undefined, social_image: undefined })]);
      if (url.includes('state=rising')) return jsonResponse([]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchDevTo();

    expect(items[0].thumbnail_url).toBeUndefined();
  });
});
