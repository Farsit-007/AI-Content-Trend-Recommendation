const mockParseURL = jest.fn();

jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({ parseURL: mockParseURL })));

jest.mock('../app/config', () => ({
  __esModule: true,
  default: {
    news_ingestion: {
      rss_feeds: ['https://techcrunch.com/feed/', 'https://medium.com/feed/tag/programming'],
    },
  },
}));

import { feedLabel, fetchRss } from '../app/modules/NewsIngestion/adapters/rss';

describe('rss-parser construction', () => {
  it('is constructed with a fetch timeout so a hung feed cannot stall the whole run', () => {
    // `new Parser(...)` runs at module-load time, and the global `clearMocks` config wipes call
    // history before this test body runs — isolateModules re-requires both modules fresh inside
    // this test so the constructor call is attributable here.
    let ParserMock: jest.Mock;
    jest.isolateModules(() => {
      ParserMock = require('rss-parser');
      require('../app/modules/NewsIngestion/adapters/rss');
    });

    expect(ParserMock!).toHaveBeenCalledWith({
      timeout: 10_000,
      customFields: { item: [['content:encoded', 'contentEncoded']] },
    });
  });
});

describe('feedLabel', () => {
  it('derives rss:<hostname> from a feed URL, lowercased with www. stripped', () => {
    expect(feedLabel('https://www.techcrunch.com/feed/')).toBe('rss:techcrunch.com');
    expect(feedLabel('https://medium.com/feed/tag/programming')).toBe('rss:medium.com');
    expect(feedLabel('https://WWW.Wired.com/feed/rss')).toBe('rss:wired.com');
  });

  it('falls back to the flat "rss" label for an unparseable feed URL', () => {
    expect(feedLabel('not-a-url')).toBe('rss');
  });
});

describe('fetchRss', () => {
  afterEach(() => {
    mockParseURL.mockReset();
  });

  it('labels items with the feed-specific source and tolerates one feed failing', async () => {
    mockParseURL.mockImplementation(async (url: string) => {
      if (url === 'https://techcrunch.com/feed/') {
        throw new Error('feed unreachable');
      }
      return {
        items: [{ title: 'Some story', link: 'https://medium.com/@author/some-story', guid: 'guid-1', isoDate: undefined }],
      };
    });

    const items = await fetchRss();

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('rss:medium.com');
  });

  it('maps a stripped content:encoded body into content when present', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Full article',
          link: 'https://medium.com/@author/full-article',
          guid: 'guid-2',
          contentSnippet: 'A short summary.',
          contentEncoded: '<p>The <b>full</b> article body.</p>',
        },
      ],
    });

    const items = await fetchRss();

    expect(items[0].snippet).toBe('A short summary.');
    expect(items[0].content).toBe('The full article body.');
  });

  it('leaves content undefined when the feed item has no content:encoded field', async () => {
    mockParseURL.mockResolvedValue({
      items: [{ title: 'Summary only', link: 'https://medium.com/@author/summary-only', guid: 'guid-3', contentSnippet: 'A summary.' }],
    });

    const items = await fetchRss();

    expect(items[0].content).toBeUndefined();
  });
});
