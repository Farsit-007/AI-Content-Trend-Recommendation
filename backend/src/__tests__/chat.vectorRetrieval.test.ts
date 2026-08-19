jest.mock('../app/modules/Chat/chat.vectorRetrieval');

import config from '../app/config';
import { NewsItem } from '../app/modules/NewsItem/newsItem.model';
import { fetchNewsContext, NewsCandidate } from '../app/modules/Chat/chat.retrieval';
import { findChatContextByVector } from '../app/modules/Chat/chat.vectorRetrieval';
import { clearTestDb, connectTestDb, disconnectTestDb } from './support/db';

const mockedVectorSearch = findChatContextByVector as jest.MockedFunction<typeof findChatContextByVector>;

/**
 * The `$vectorSearch` stage itself cannot run here — Atlas Vector Search has no equivalent in
 * mongodb-memory-server — so `chat.vectorRetrieval` is mocked at its module boundary, exactly as
 * `newsItem.semanticMatch` is. What matters and *is* testable is the contract around it: that the
 * flag routes correctly, and that every failure mode falls back to the in-memory pool rather than
 * failing the user's question.
 */

const oneHot = (i: number): number[] => {
  const v = Array(1536).fill(0);
  v[i] = 1;
  return v;
};

let seq = 0;
const seedItem = async (title: string, embedding: number[]) => {
  seq += 1;
  return NewsItem.create({
    source: 'hackernews',
    source_id: `s${seq}`,
    content_hash: `hash-${seq}`,
    title,
    url: `https://example.test/${seq}`,
    embedding,
    trend_score: 5,
    lifecycle: 'active',
  });
};

beforeAll(connectTestDb);
afterEach(async () => {
  await clearTestDb();
  config.chat.vector_search_enabled = false;
});
afterAll(disconnectTestDb);

describe('chat context retrieval — vector path routing', () => {
  it('does not touch vector search when the flag is off', async () => {
    config.chat.vector_search_enabled = false;
    await seedItem('In-memory story', oneHot(0));

    const result = await fetchNewsContext(oneHot(0));

    expect(mockedVectorSearch).not.toHaveBeenCalled();
    expect(result.context).toHaveLength(1);
  });

  it('uses vector search results when the flag is on', async () => {
    config.chat.vector_search_enabled = true;
    // Deliberately not in the database: proves the result came from the vector path, not the pool.
    const fromIndex: NewsCandidate[] = [
      { title: 'Only in the index', trend_score: 9, embedding: oneHot(0) },
    ];
    mockedVectorSearch.mockResolvedValueOnce(fromIndex);

    const result = await fetchNewsContext(oneHot(0));

    expect(mockedVectorSearch).toHaveBeenCalledTimes(1);
    expect(result.context[0].content).toContain('Only in the index');
  });

  it('passes the configured window as the pre-filter cutoff', async () => {
    config.chat.vector_search_enabled = true;
    mockedVectorSearch.mockResolvedValueOnce([{ title: 'x', trend_score: 1, embedding: oneHot(0) }]);

    const before = Date.now();
    await fetchNewsContext(oneHot(0));

    const [, since] = mockedVectorSearch.mock.calls[0];
    const expected = before - config.chat.context_window_days * 24 * 3600 * 1000;
    expect(Math.abs((since as Date).getTime() - expected)).toBeLessThan(5_000);
  });

  it('falls back to the in-memory pool when vector search throws', async () => {
    // The realistic failure: the Atlas index doesn't exist, or lacks the declared filter fields.
    config.chat.vector_search_enabled = true;
    mockedVectorSearch.mockRejectedValueOnce(new Error('index not found: news_items_vector_index'));
    await seedItem('Fallback story', oneHot(0));

    const result = await fetchNewsContext(oneHot(0));

    expect(result.context).toHaveLength(1);
    expect(result.context[0].content).toContain('Fallback story');
  });

  it('falls back when vector search returns nothing rather than answering with no context', async () => {
    config.chat.vector_search_enabled = true;
    mockedVectorSearch.mockResolvedValueOnce([]);
    await seedItem('Fallback story', oneHot(0));

    const result = await fetchNewsContext(oneHot(0));

    expect(result.context).toHaveLength(1);
  });

  it('still reports poolSize and topSimilarity on the vector path', async () => {
    config.chat.vector_search_enabled = true;
    mockedVectorSearch.mockResolvedValueOnce([
      { title: 'Exact match', trend_score: 5, embedding: oneHot(0) },
    ]);

    const result = await fetchNewsContext(oneHot(0));

    // The low-relevance annotation in chat.service reads these; the vector path must not blank them.
    expect(result.poolSize).toBe(1);
    expect(result.topSimilarity).toBeCloseTo(1);
  });
});
