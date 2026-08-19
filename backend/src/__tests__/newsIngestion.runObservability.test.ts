import { AdapterResult } from '../app/modules/NewsIngestion/newsIngestion.interface';
import { buildSourceRunCounts } from '../app/modules/NewsIngestion/newsIngestion.service';
import { IngestionRun } from '../app/modules/IngestionRun/ingestionRun.model';
import { BrandVoiceExample } from '../app/modules/BrandVoiceExample/brandVoiceExample.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';

jest.mock('../app/modules/NewsIngestion/adapters');
jest.mock('../app/lib/embeddings');
jest.mock('../app/modules/NewsIngestion/newsIngestion.categorize');
jest.mock('../app/modules/NewsIngestion/newsIngestion.contentFetch');

import { runAllAdapters } from '../app/modules/NewsIngestion/adapters';
import { embedBatch } from '../app/lib/embeddings';
import { categorizeBatch } from '../app/modules/NewsIngestion/newsIngestion.categorize';
import { enrichContent } from '../app/modules/NewsIngestion/newsIngestion.contentFetch';
import { runIngestionPipeline } from '../app/modules/NewsIngestion/newsIngestion.service';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import config from '../app/config';

const mockedRunAllAdapters = runAllAdapters as jest.MockedFunction<typeof runAllAdapters>;
const mockedEmbedBatch = embedBatch as jest.MockedFunction<typeof embedBatch>;
const mockedCategorizeBatch = categorizeBatch as jest.MockedFunction<typeof categorizeBatch>;
const mockedEnrichContent = enrichContent as jest.MockedFunction<typeof enrichContent>;

const rawItem = (
  source: string,
  id: string,
  title = `Story ${id}`,
  overrides: Partial<AdapterResult['items'][number]> = {},
): AdapterResult['items'][number] => ({
  source,
  source_id: id,
  title,
  url: `https://example.test/${source}/${id}`,
  raw_points: 10,
  raw_comments: 2,
  raw_stars_delta: 0,
  ...overrides,
});

// One-hot vectors are pairwise orthogonal (cosine similarity 0), keeping every mocked embedBatch()
// call comfortably below the semantic-dedup threshold regardless of call order or input text.
const oneHotEmbedBatch = () => {
  let i = 0;
  return jest.fn().mockImplementation(async (texts: string[]) =>
    texts.map(() => {
      const v = Array(1536).fill(0);
      v[i % 1536] = 1;
      i += 1;
      return v;
    }),
  );
};

// Mirrors `categorizeBatch`'s `CategorizationOutcome` shape (items + the run's LLM/cap counters),
// not a bare array — the pipeline reads `.items` and persists the counters to `ingestion_runs`.
const passthroughCategorize = () =>
  jest.fn().mockImplementation(async (items: { source: string }[]) => ({
    items: items.map((item) => ({
      ...item,
      category: 'AI',
      impact_note: 'note',
      category_confidence: 0.9,
      audience_fit: 0.5,
    })),
    llm_categorized: items.length,
    cap_deferred: 0,
  }));

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

// Default: enrichment is a no-op pass-through, so tests unrelated to content enrichment are
// unaffected by it now sitting in the pipeline. Individual tests below override this.
beforeEach(() => {
  mockedEnrichContent.mockImplementation(async (items) => ({ items, countsBySource: {} }));
});

describe('buildSourceRunCounts', () => {
  it('reports six-layer counts that sum to fetched when every layer completed', () => {
    const result = buildSourceRunCounts(
      ['hackernews'],
      { hackernews: 10 },
      { hackernews: 8 },
      { hackernews: 6 },
      { hackernews: 5 },
      { hackernews: 3 },
      {},
    );
    const row = result.find((r) => r.source === 'hackernews')!;
    expect(row).toMatchObject({ fetched: 10, fresh_dropped: 2, hash_deduped: 2, semantic_deduped: 1, relevance_dropped: 2, stored: 3 });
  });

  it('does not fabricate a 100% drop for layers the pipeline never reached', () => {
    // fresh/unique completed, but semantic dedup (and everything after it) never ran.
    const result = buildSourceRunCounts(['hackernews'], { hackernews: 10 }, { hackernews: 8 }, { hackernews: 6 }, undefined, undefined, {});
    const row = result.find((r) => r.source === 'hackernews')!;
    expect(row).toMatchObject({ fetched: 10, fresh_dropped: 2, hash_deduped: 2, semantic_deduped: 0, relevance_dropped: 0, stored: 0 });
  });

  it('reports fetched-only counts when the pipeline died in Layer 1', () => {
    const result = buildSourceRunCounts(['hackernews'], { hackernews: 10 }, undefined, undefined, undefined, undefined, {});
    const row = result.find((r) => r.source === 'hackernews')!;
    expect(row).toMatchObject({ fetched: 10, fresh_dropped: 0, hash_deduped: 0, semantic_deduped: 0, relevance_dropped: 0, stored: 0 });
  });

  it('attaches the adapter error string to its source row', () => {
    const result = buildSourceRunCounts(['reddit'], {}, undefined, undefined, undefined, undefined, { reddit: 'HTTP 403' });
    expect(result.find((r) => r.source === 'reddit')).toMatchObject({ fetched: 0, error: 'HTTP 403' });
  });
});

describe('runIngestionPipeline persistence', () => {
  it('persists a complete run whose per-source counts sum to fetched, on success', async () => {
    mockedRunAllAdapters.mockResolvedValue([
      { source: 'hackernews', items: [rawItem('hackernews', '1'), rawItem('hackernews', '2')] },
    ]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());

    const summary = await runIngestionPipeline('manual');
    expect(summary.totalStored).toBe(2);

    const runs = await IngestionRun.find();
    expect(runs).toHaveLength(1);
    const row = runs[0].sources.find((s) => s.source === 'hackernews')!;
    expect(row.fetched).toBe(2);
    expect(row.fresh_dropped + row.hash_deduped + row.semantic_deduped + row.relevance_dropped + row.stored).toBe(row.fetched);
    expect(row.stored).toBe(2);
    expect(runs[0].trigger).toBe('manual');
    expect(runs[0].error).toBeUndefined();
  });

  it('persists a partial run and still throws when the pipeline crashes mid-layer', async () => {
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockRejectedValue(new Error('embedding blew up'));

    await expect(runIngestionPipeline('manual')).rejects.toThrow('embedding blew up');

    const runs = await IngestionRun.find();
    expect(runs).toHaveLength(1);
    expect(runs[0].error).toBe('embedding blew up');
    const row = runs[0].sources.find((s) => s.source === 'hackernews')!;
    // Layer 1 and hash-dedup/freshness completed; semantic dedup (where embed() threw) never did.
    expect(row).toMatchObject({ fetched: 1, fresh_dropped: 0, hash_deduped: 0, semantic_deduped: 0, relevance_dropped: 0, stored: 0 });
  });

  it('does not let a failed IngestionRun write change the pipeline outcome on success', async () => {
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());
    const createSpy = jest.spyOn(IngestionRun, 'create').mockRejectedValueOnce(new Error('mongo unavailable'));

    const summary = await runIngestionPipeline('manual');
    expect(summary.totalStored).toBe(1);

    createSpy.mockRestore();
  });

  it('does not let a failed IngestionRun write mask the original error on a crash', async () => {
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockRejectedValue(new Error('embedding blew up'));
    const createSpy = jest.spyOn(IngestionRun, 'create').mockRejectedValueOnce(new Error('mongo unavailable'));

    await expect(runIngestionPipeline('manual')).rejects.toThrow('embedding blew up');

    createSpy.mockRestore();
  });

  it('completes and stores items unenriched when content enrichment throws, rather than aborting', async () => {
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());
    mockedEnrichContent.mockRejectedValueOnce(new Error('enrichment blew up'));

    const summary = await runIngestionPipeline('manual');

    expect(summary.totalStored).toBe(1);
    const runs = await IngestionRun.find();
    expect(runs[0].error).toBeUndefined();
  });

  it('carries discussion_url and thumbnail_url from the adapter item through to the stored NewsItem', async () => {
    mockedRunAllAdapters.mockResolvedValue([
      {
        source: 'producthunt',
        items: [
          rawItem('producthunt', '1', 'Story 1', {
            discussion_url: 'https://www.producthunt.com/posts/acme',
            thumbnail_url: 'https://ph-files.imgix.net/acme.png',
          }),
        ],
      },
    ]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());

    const summary = await runIngestionPipeline('manual');
    expect(summary.totalStored).toBe(1);

    const stored = await NewsItem.findOne({ source: 'producthunt', source_id: '1' });
    expect(stored?.discussion_url).toBe('https://www.producthunt.com/posts/acme');
    expect(stored?.thumbnail_url).toBe('https://ph-files.imgix.net/acme.png');
  });

  it('leaves discussion_url and thumbnail_url unset on the stored NewsItem when the adapter item has neither', async () => {
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());

    const summary = await runIngestionPipeline('manual');
    expect(summary.totalStored).toBe(1);

    const stored = await NewsItem.findOne({ source: 'hackernews', source_id: '1' });
    expect(stored?.discussion_url).toBeUndefined();
    expect(stored?.thumbnail_url).toBeUndefined();
  });

  it('stores an item with a low relevance_score rather than dropping it (flexible-news-taxonomy-and-relevance)', async () => {
    // A brand-voice example whose embedding is orthogonal to every item's one-hot embedding below
    // guarantees relevance_score 0 for all of them — under the old gate (min_relevance 4.0,
    // non-empty pool) every one of these would have been silently dropped before storage.
    await BrandVoiceExample.create({
      team_id: 'test-team',
      platform: 'facebook',
      content: 'unrelated brand voice content',
      embedding: Array(1536).fill(0).map((_, i) => (i === 1500 ? 1 : 0)),
    });
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());

    const summary = await runIngestionPipeline('manual');

    expect(summary.totalStored).toBe(1);
    const stored = await NewsItem.findOne({ source: 'hackernews', source_id: '1' });
    expect(stored).not.toBeNull();
    expect(stored?.relevance_score).toBe(0);

    const runs = await IngestionRun.find();
    const row = runs[0].sources.find((s) => s.source === 'hackernews')!;
    expect(row.relevance_dropped).toBe(0);
    expect(row.stored).toBe(1);
  });

  it('enriches a high-relevance item (content-enrichment keeps its own separate relevance floor)', async () => {
    const oneHot = (i: number) => Array(1536).fill(0).map((_, idx) => (idx === i ? 1 : 0));
    await BrandVoiceExample.create({
      team_id: 'test-team',
      platform: 'facebook',
      content: 'matching brand voice content',
      embedding: oneHot(0), // matches the single item's embedding below (index 0) — relevance ~10
    });
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());

    await runIngestionPipeline('manual');

    expect(mockedEnrichContent).toHaveBeenCalledTimes(1);
    expect(mockedEnrichContent.mock.calls[0][0]).toHaveLength(1);
  });

  it('skips content enrichment for a low-relevance item, but still stores it', async () => {
    const oneHot = (i: number) => Array(1536).fill(0).map((_, idx) => (idx === i ? 1 : 0));
    await BrandVoiceExample.create({
      team_id: 'test-team',
      platform: 'facebook',
      content: 'unrelated brand voice content',
      embedding: oneHot(999), // orthogonal to the item's embedding below (index 0) — relevance 0
    });
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());

    const summary = await runIngestionPipeline('manual');

    expect(mockedEnrichContent.mock.calls[0][0]).toHaveLength(0);
    expect(summary.totalStored).toBe(1);
    const stored = await NewsItem.findOne({ source: 'hackernews', source_id: '1' });
    expect(stored).not.toBeNull();
  });

  it('never invokes content enrichment when NEWS_CONTENT_FETCH_ENABLED is false', async () => {
    const originalEnabled = config.news_ingestion.content_fetch.enabled;
    config.news_ingestion.content_fetch.enabled = false;
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbedBatch.mockImplementation(oneHotEmbedBatch());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());

    const summary = await runIngestionPipeline('manual');

    expect(summary.totalStored).toBe(1);
    expect(mockedEnrichContent).not.toHaveBeenCalled();

    config.news_ingestion.content_fetch.enabled = originalEnabled;
  });
});
