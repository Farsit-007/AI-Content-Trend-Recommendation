"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const newsIngestion_service_1 = require("../app/modules/NewsIngestion/newsIngestion.service");
describe('unionSourceKeys', () => {
    it('keeps adapter names first, then appends item-only labels in order', () => {
        expect((0, newsIngestion_service_1.unionSourceKeys)(['hackernews', 'rss'], ['hackernews', 'rss:techcrunch.com', 'rss:medium.com'])).toEqual([
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
        const summaries = (0, newsIngestion_service_1.buildSourceSummaries)(adapterSources, fetchedCounts, freshCounts, uniqueCounts, relevantCounts);
        expect(summaries.find((s) => s.source === 'rss:techcrunch.com')).toMatchObject({ fetched: 3, stored: 3 });
        expect(summaries.find((s) => s.source === 'rss:medium.com')).toMatchObject({ fetched: 2, stored: 2 });
    });
    it('gives a zero-count row for an adapter that threw and fetched nothing', () => {
        const adapterSources = ['hackernews', 'reddit'];
        const fetchedCounts = { hackernews: 5 };
        const summaries = (0, newsIngestion_service_1.buildSourceSummaries)(adapterSources, fetchedCounts, { hackernews: 5 }, { hackernews: 5 }, { hackernews: 5 });
        expect(summaries.find((s) => s.source === 'reddit')).toMatchObject({
            fetched: 0,
            deduped: 0,
            discarded: 0,
            stored: 0,
        });
    });
});
describe('withContentMeta', () => {
    it('reports content_status: none and no content when nothing was provided', () => {
        expect((0, newsIngestion_service_1.withContentMeta)(undefined, 20000)).toEqual({ content_status: 'none' });
    });
    it('reports content_status: full and a positive word_count for content under the cap', () => {
        const meta = (0, newsIngestion_service_1.withContentMeta)('a short piece of content', 20000);
        expect(meta.content_status).toBe('full');
        expect(meta.content).toBe('a short piece of content');
        expect(meta.word_count).toBe(5);
        expect(meta.content_fetched_at).toBeInstanceOf(Date);
    });
    it('caps oversized content and reports content_status: partial', () => {
        const longContent = 'word '.repeat(10);
        const meta = (0, newsIngestion_service_1.withContentMeta)(longContent, 10);
        expect(meta.content_status).toBe('partial');
        expect(meta.content).toHaveLength(10);
        expect(meta.content).toBe(longContent.slice(0, 10));
    });
});
