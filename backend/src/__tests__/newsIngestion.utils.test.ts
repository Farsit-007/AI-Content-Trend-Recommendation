jest.mock('../app/lib/openrouterClient');

jest.mock('../app/config', () => ({
  __esModule: true,
  default: { embedding_model: 'test-embedding-model' },
}));

import { openrouter } from '../app/lib/openrouterClient';
import { HashedNewsItem, embedItems } from '../app/modules/NewsIngestion/newsIngestion.utils';

const mocked = openrouter as unknown as { embeddings: { create: jest.Mock } };

const hashedItem = (n: number): HashedNewsItem => ({
  source: 'test',
  source_id: String(n),
  content_hash: `hash-${n}`,
  title: `Item ${n}`,
  url: `https://example.com/${n}`,
  raw_points: 0,
  raw_comments: 0,
  raw_stars_delta: 0,
});

describe('embedItems', () => {
  afterEach(() => jest.clearAllMocks());

  it('resolves to [] without any API call for an empty list', async () => {
    const result = await embedItems([]);

    expect(result).toEqual([]);
    expect(mocked.embeddings.create).not.toHaveBeenCalled();
  });

  it('splits more than EMBED_BATCH_SIZE items into multiple batched calls and preserves item order', async () => {
    const items = Array.from({ length: 45 }, (_, i) => hashedItem(i));
    mocked.embeddings.create.mockImplementation(async (req: { input: string[] }) => ({
      data: req.input.map(() => ({ embedding: [1, 2, 3] })),
    }));

    const embedded = await embedItems(items);

    // 45 items at EMBED_BATCH_SIZE=20 -> 3 batched calls (20 + 20 + 5), not one call per item.
    expect(mocked.embeddings.create).toHaveBeenCalledTimes(3);
    expect(embedded).toHaveLength(45);
    expect(embedded.map((i) => i.source_id)).toEqual(items.map((i) => i.source_id));
    expect(embedded.every((i) => i.embedding.length === 3)).toBe(true);
  });

  it('propagates an embedding failure as a rejection', async () => {
    mocked.embeddings.create.mockResolvedValue({});

    await expect(embedItems([hashedItem(1)])).rejects.toThrow(
      'OpenRouter embedding response did not contain the expected vectors',
    );
  });
});
