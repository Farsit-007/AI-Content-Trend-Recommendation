import { readFileSync } from 'fs';
import path from 'path';

jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      content_fetch: { enabled: true, timeout_ms: 200, concurrency: 2 },
      github_token: undefined,
    },
  },
}));

jest.mock('@extractus/article-extractor', () => ({
  extractFromHtml: jest.fn(),
}));

import { extractFromHtml } from '@extractus/article-extractor';
import config from '../app/config';
import {
  enrichContent,
  extractFromUrl,
  fetchDevToBody,
  fetchGithubReadme,
  mapWithConcurrency,
} from '../app/modules/NewsIngestion/newsIngestion.contentFetch';

const mockedExtractFromHtml = extractFromHtml as jest.Mock;
const articleFixture = readFileSync(path.join(__dirname, 'fixtures', 'article.html'), 'utf-8');

interface TestEnrichableItem {
  source: string;
  source_id: string;
  url: string;
  content?: string;
  content_status?: 'failed';
}

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const items = [50, 10, 30];
    const results = await mapWithConcurrency(items, 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });

    expect(results).toEqual([50, 10, 30]);
  });

  it('never has more than `limit` items in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 8 }, (_, i) => i);

    await mapWithConcurrency(items, 2, async (i) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return i;
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('handles an empty array', async () => {
    const results = await mapWithConcurrency([] as number[], 3, async (x) => x);
    expect(results).toEqual([]);
  });
});

describe('fetchDevToBody', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns body_markdown on a 200 response', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ body_markdown: 'Full article body.' }) })) as unknown as typeof fetch;

    await expect(fetchDevToBody('123')).resolves.toBe('Full article body.');
  });

  it('returns undefined on a non-200 response', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;

    await expect(fetchDevToBody('123')).resolves.toBeUndefined();
  });

  it('returns undefined when body_markdown is missing from the response', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;

    await expect(fetchDevToBody('123')).resolves.toBeUndefined();
  });
});

describe('fetchGithubReadme', () => {
  const originalFetch = global.fetch;
  const originalToken = config.news_ingestion.github_token;

  afterEach(() => {
    global.fetch = originalFetch;
    config.news_ingestion.github_token = originalToken;
  });

  it('requests the readme endpoint for the given owner/repo', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: { headers: Record<string, string> }) => ({
      ok: true,
      text: async () => '# README',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchGithubReadme('facebook/react');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/facebook/react/readme');
  });

  it('omits the Authorization header when no GitHub token is configured', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: { headers: Record<string, string> }) => ({
      ok: true,
      text: async () => '# README',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchGithubReadme('facebook/react');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('includes an Authorization header when a GitHub token is configured', async () => {
    config.news_ingestion.github_token = 'test-token';
    const fetchMock = jest.fn(async (_url: string, _init: { headers: Record<string, string> }) => ({
      ok: true,
      text: async () => '# README',
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchGithubReadme('facebook/react');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  it('returns undefined on a non-200 response', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;

    await expect(fetchGithubReadme('owner/repo')).resolves.toBeUndefined();
  });
});

describe('extractFromUrl', () => {
  const originalFetch = global.fetch;

  const htmlResponse = (html: string, contentType = 'text/html; charset=utf-8') => ({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => html,
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockedExtractFromHtml.mockReset();
  });

  it('extracts and strips text from a realistic article page', async () => {
    global.fetch = jest.fn(async () => htmlResponse(articleFixture)) as unknown as typeof fetch;
    mockedExtractFromHtml.mockResolvedValue({
      content: '<p>This is the opening paragraph.</p><p>This is the <b>second</b> paragraph.</p>',
    });

    const result = await extractFromUrl('https://example.test/article');

    expect(result).toBe('This is the opening paragraph.This is the second paragraph.');
  });

  it('returns undefined for a non-2xx response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => '',
    })) as unknown as typeof fetch;

    await expect(extractFromUrl('https://example.test/missing')).resolves.toBeUndefined();
    expect(mockedExtractFromHtml).not.toHaveBeenCalled();
  });

  it('returns undefined when the response content-type is not HTML', async () => {
    global.fetch = jest.fn(async () => htmlResponse('{}', 'application/json')) as unknown as typeof fetch;

    await expect(extractFromUrl('https://example.test/api')).resolves.toBeUndefined();
    expect(mockedExtractFromHtml).not.toHaveBeenCalled();
  });

  it('returns undefined when the response body exceeds the size guard', async () => {
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    global.fetch = jest.fn(async () => htmlResponse(oversized)) as unknown as typeof fetch;

    await expect(extractFromUrl('https://example.test/huge')).resolves.toBeUndefined();
    expect(mockedExtractFromHtml).not.toHaveBeenCalled();
  });

  it('returns undefined when extraction yields no content', async () => {
    global.fetch = jest.fn(async () => htmlResponse('<html><body></body></html>')) as unknown as typeof fetch;
    mockedExtractFromHtml.mockResolvedValue(null);

    await expect(extractFromUrl('https://example.test/empty')).resolves.toBeUndefined();
  });

  it('returns undefined when the request exceeds the configured timeout', async () => {
    global.fetch = jest.fn(
      (_url: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;

    await expect(extractFromUrl('https://example.test/slow')).resolves.toBeUndefined();
  });
});

describe('enrichContent', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    mockedExtractFromHtml.mockReset();
  });

  it('passes an item with existing content through unchanged, making no fetch attempt', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const item: TestEnrichableItem = { source: 'hackernews', source_id: '1', url: 'https://example.test/a', content: 'already here' };

    const { items, countsBySource } = await enrichContent([item]);

    expect(items[0].content).toBe('already here');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(countsBySource).toEqual({});
  });

  it('routes a devto item to the dev.to article-by-id API', async () => {
    global.fetch = jest.fn(async (url: string) => {
      expect(url).toContain('dev.to/api/articles/');
      return { ok: true, json: async () => ({ body_markdown: 'Body text' }) };
    }) as unknown as typeof fetch;

    const { items, countsBySource } = await enrichContent<TestEnrichableItem>([
      { source: 'devto', source_id: '99', url: 'https://dev.to/x' },
    ]);

    expect(items[0].content).toBe('Body text');
    expect(countsBySource.devto).toEqual({ fetched: 1, failed: 0 });
  });

  it('routes a github_trending item to the GitHub README API', async () => {
    global.fetch = jest.fn(async (url: string) => {
      expect(url).toContain('/readme');
      return { ok: true, text: async () => '# README text' };
    }) as unknown as typeof fetch;

    const { items, countsBySource } = await enrichContent<TestEnrichableItem>([
      { source: 'github_trending', source_id: 'owner/repo', url: 'https://github.com/owner/repo' },
    ]);

    expect(items[0].content).toBe('# README text');
    expect(countsBySource.github_trending).toEqual({ fetched: 1, failed: 0 });
  });

  it('routes any other source to generic page extraction', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<html><body><article>Content</article></body></html>',
    })) as unknown as typeof fetch;
    mockedExtractFromHtml.mockResolvedValue({ content: 'Extracted content.' });

    const { items, countsBySource } = await enrichContent<TestEnrichableItem>([
      { source: 'mastodon', source_id: 'x', url: 'https://example.test/y' },
    ]);

    expect(items[0].content).toBe('Extracted content.');
    expect(countsBySource.mastodon).toEqual({ fetched: 1, failed: 0 });
  });

  it('marks content_status failed and increments the failed count when nothing is found', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => '',
    })) as unknown as typeof fetch;

    const { items, countsBySource } = await enrichContent<TestEnrichableItem>([
      { source: 'mastodon', source_id: 'x', url: 'https://example.test/y' },
    ]);

    expect(items[0].content).toBeUndefined();
    expect(items[0].content_status).toBe('failed');
    expect(countsBySource.mastodon).toEqual({ fetched: 0, failed: 1 });
  });
});
