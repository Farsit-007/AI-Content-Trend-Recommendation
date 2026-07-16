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
});
