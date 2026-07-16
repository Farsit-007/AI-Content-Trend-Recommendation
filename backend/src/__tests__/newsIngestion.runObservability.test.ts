import { AdapterResult } from '../app/modules/NewsIngestion/newsIngestion.interface';
import { buildSourceRunCounts } from '../app/modules/NewsIngestion/newsIngestion.service';
import { IngestionRun } from '../app/modules/IngestionRun/ingestionRun.model';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';

jest.mock('../app/modules/NewsIngestion/adapters');
jest.mock('../app/lib/embeddings');
jest.mock('../app/modules/NewsIngestion/newsIngestion.categorize');

import { runAllAdapters } from '../app/modules/NewsIngestion/adapters';
import { embed } from '../app/lib/embeddings';
import { categorizeBatch } from '../app/modules/NewsIngestion/newsIngestion.categorize';
import { runIngestionPipeline } from '../app/modules/NewsIngestion/newsIngestion.service';

const mockedRunAllAdapters = runAllAdapters as jest.MockedFunction<typeof runAllAdapters>;
const mockedEmbed = embed as jest.MockedFunction<typeof embed>;
const mockedCategorizeBatch = categorizeBatch as jest.MockedFunction<typeof categorizeBatch>;

const rawItem = (source: string, id: string, title = `Story ${id}`): AdapterResult['items'][number] => ({
  source,
  source_id: id,
  title,
  url: `https://example.test/${source}/${id}`,
  raw_points: 10,
  raw_comments: 2,
  raw_stars_delta: 0,
});

// One-hot vectors are pairwise orthogonal (cosine similarity 0), keeping every mocked embed()
// call comfortably below the semantic-dedup threshold regardless of call order or input text.
const oneHotEmbed = () => {
  let i = 0;
  return jest.fn().mockImplementation(async () => {
    const v = Array(1536).fill(0);
    v[i % 1536] = 1;
    i += 1;
    return v;
  });
};

const passthroughCategorize = () =>
  jest.fn().mockImplementation(async (items: { source: string }[]) =>
    items.map((item) => ({
      ...item,
      category: 'AI',
      impact_note: 'note',
      category_confidence: 0.9,
      audience_fit: 0.5,
    })),
  );

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

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
    mockedEmbed.mockImplementation(oneHotEmbed());
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
    mockedEmbed.mockRejectedValue(new Error('embedding blew up'));

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
    mockedEmbed.mockImplementation(oneHotEmbed());
    mockedCategorizeBatch.mockImplementation(passthroughCategorize());
    const createSpy = jest.spyOn(IngestionRun, 'create').mockRejectedValueOnce(new Error('mongo unavailable'));

    const summary = await runIngestionPipeline('manual');
    expect(summary.totalStored).toBe(1);

    createSpy.mockRestore();
  });

  it('does not let a failed IngestionRun write mask the original error on a crash', async () => {
    mockedRunAllAdapters.mockResolvedValue([{ source: 'hackernews', items: [rawItem('hackernews', '1')] }]);
    mockedEmbed.mockRejectedValue(new Error('embedding blew up'));
    const createSpy = jest.spyOn(IngestionRun, 'create').mockRejectedValueOnce(new Error('mongo unavailable'));

    await expect(runIngestionPipeline('manual')).rejects.toThrow('embedding blew up');

    createSpy.mockRestore();
  });
});
