import { buildSourceSummaries, unionSourceKeys } from '../app/modules/NewsIngestion/newsIngestion.service';

describe('unionSourceKeys', () => {
  it('keeps adapter names first, then appends item-only labels in order', () => {
    expect(unionSourceKeys(['hackernews', 'rss'], ['hackernews', 'rss:techcrunch.com', 'rss:medium.com'])).toEqual([
      'hackernews',
      'rss',
      'rss:techcrunch.com',
      'rss:medium.com',
    ]);
  });
});

describe('buildSourceSummaries', () => {
  it('gives two rows for an adapter that emitted two distinct rss:<host> labels', () => {
    const adapterSources = ['hackernews', 'rss'];
    const fetchedCounts = { hackernews: 5, 'rss:techcrunch.com': 3, 'rss:medium.com': 2 };
    const freshCounts = { hackernews: 5, 'rss:techcrunch.com': 3, 'rss:medium.com': 2 };
    const uniqueCounts = { hackernews: 5, 'rss:techcrunch.com': 3, 'rss:medium.com': 2 };
    const relevantCounts = { hackernews: 5, 'rss:techcrunch.com': 3, 'rss:medium.com': 2 };

    const summaries = buildSourceSummaries(adapterSources, fetchedCounts, freshCounts, uniqueCounts, relevantCounts);

    expect(summaries.find((s) => s.source === 'rss:techcrunch.com')).toMatchObject({ fetched: 3, stored: 3 });
    expect(summaries.find((s) => s.source === 'rss:medium.com')).toMatchObject({ fetched: 2, stored: 2 });
  });

  it('gives a zero-count row for an adapter that threw and fetched nothing', () => {
    const adapterSources = ['hackernews', 'reddit'];
    const fetchedCounts = { hackernews: 5 };

    const summaries = buildSourceSummaries(adapterSources, fetchedCounts, { hackernews: 5 }, { hackernews: 5 }, { hackernews: 5 });

    expect(summaries.find((s) => s.source === 'reddit')).toMatchObject({
      fetched: 0,
      deduped: 0,
      discarded: 0,
      stored: 0,
    });
  });
});
