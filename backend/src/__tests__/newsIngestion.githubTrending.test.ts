jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      max_age_hours: 72,
      github_token: undefined,
    },
  },
}));

import { enrichTitle, fetchGithubTrending } from '../app/modules/NewsIngestion/adapters/githubTrending';

const TRENDING_URL = 'https://github.com/trending';
const SEARCH_URL_PREFIX = 'https://api.github.com/search/repositories';

const trendingHtml = (repos: { path: string; description?: string; stars?: number }[]): string =>
  repos
    .map(
      (r) => `<article class="Box-row">
        <a href="/${r.path}">${r.path}</a>
        ${r.description ? `<p class="col-9 color-fg-muted my-1 pr-4">${r.description}</p>` : ''}
        <span>${r.stars ?? 5} stars today</span>
      </article>`,
    )
    .join('\n');

const htmlResponse = (html: string): Response => ({ ok: true, text: async () => html }) as Response;
const failedResponse = (status: number): Response => ({ ok: false, status, text: async () => '', json: async () => ({}) }) as Response;

const searchApiRepo = (fullName: string, overrides: Partial<{ description: string | null; stars: number; created_at: string }> = {}) => ({
  full_name: fullName,
  html_url: `https://github.com/${fullName}`,
  description: overrides.description ?? null,
  created_at: overrides.created_at ?? new Date().toISOString(),
  stargazers_count: overrides.stars ?? 10,
});

const searchApiResponse = (repos: ReturnType<typeof searchApiRepo>[]): Response =>
  ({ ok: true, json: async () => ({ items: repos }) }) as Response;

describe('enrichTitle', () => {
  it('appends the description when present', () => {
    expect(enrichTitle('owner/repo', 'A cool project')).toBe('owner/repo — A cool project');
  });

  it('returns the bare full name when there is no description', () => {
    expect(enrichTitle('owner/repo', undefined)).toBe('owner/repo');
    expect(enrichTitle('owner/repo', null)).toBe('owner/repo');
  });

  it('truncates long descriptions at 200 characters with an ellipsis', () => {
    const long = 'x'.repeat(250);
    const result = enrichTitle('owner/repo', long);
    expect(result).toBe(`owner/repo — ${'x'.repeat(200)}…`);
  });
});

describe('fetchGithubTrending', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws when the scrape errors and the Search API also errors', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url === TRENDING_URL) return failedResponse(500);
      if (url.startsWith(SEARCH_URL_PREFIX)) return failedResponse(503);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchGithubTrending()).rejects.toThrow('both fetch paths yielded nothing');
  });

  it('returns Search API items when the scrape parses to zero blocks', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url === TRENDING_URL) return htmlResponse('<html>no matching markup</html>');
      if (url.startsWith(SEARCH_URL_PREFIX)) return searchApiResponse([searchApiRepo('new/repo')]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGithubTrending();

    expect(items).toHaveLength(1);
    expect(items[0].source_id).toBe('new/repo');
  });

  it('returns scraped items when the Search API call fails', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url === TRENDING_URL) return htmlResponse(trendingHtml([{ path: 'owner/repo' }]));
      if (url.startsWith(SEARCH_URL_PREFIX)) return failedResponse(500);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGithubTrending();

    expect(items).toHaveLength(1);
    expect(items[0].source_id).toBe('owner/repo');
  });

  it('deduplicates a repository appearing in both fetch paths, keeping the scrape entry', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url === TRENDING_URL) return htmlResponse(trendingHtml([{ path: 'owner/repo', description: 'from scrape' }]));
      if (url.startsWith(SEARCH_URL_PREFIX)) return searchApiResponse([searchApiRepo('owner/repo', { description: 'from api' })]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGithubTrending();

    expect(items).toHaveLength(1);
    expect(items[0].snippet).toBe('from scrape');
  });

  it('sets published_at from the Search API but leaves it undefined for scraped items', async () => {
    const createdAt = '2026-07-10T00:00:00.000Z';
    const fetchMock = jest.fn(async (url: string) => {
      if (url === TRENDING_URL) return htmlResponse(trendingHtml([{ path: 'scraped/repo' }]));
      if (url.startsWith(SEARCH_URL_PREFIX)) return searchApiResponse([searchApiRepo('api/repo', { created_at: createdAt })]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const items = await fetchGithubTrending();

    const scraped = items.find((i) => i.source_id === 'scraped/repo')!;
    const fromApi = items.find((i) => i.source_id === 'api/repo')!;
    expect(scraped.published_at).toBeUndefined();
    expect(fromApi.published_at).toEqual(new Date(createdAt));
  });

  it('resolves to an empty array when both paths legitimately find nothing', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url === TRENDING_URL) return htmlResponse('<html>nothing matches</html>');
      if (url.startsWith(SEARCH_URL_PREFIX)) return searchApiResponse([]);
      throw new Error(`unexpected url: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchGithubTrending()).resolves.toEqual([]);
  });
});
