jest.mock('../app/lib/openrouterClient');

jest.mock('../app/config', () => ({
  __esModule: true,
  default: { embedding_model: 'test-embedding-model' },
}));

import { openrouter } from '../app/lib/openrouterClient';
import { embed, embedBatch } from '../app/lib/embeddings';

const mocked = openrouter as unknown as { embeddings: { create: jest.Mock } };

describe('embed', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the vector from a well-formed response', async () => {
    mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });

    await expect(embed('hello')).resolves.toEqual([0.1, 0.2]);
  });

  it('throws a clear error instead of a raw TypeError when the response has no data array', async () => {
    mocked.embeddings.create.mockResolvedValue({});

    await expect(embed('hello')).rejects.toThrow('OpenRouter embedding response did not contain a vector');
  });

  it('truncates oversized input before sending it to the API', async () => {
    mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [0.1] }] });

    await embed('x'.repeat(10_000));

    const sentInput = mocked.embeddings.create.mock.calls[0][0].input as string;
    expect(sentInput.length).toBe(6000);
  });
});

describe('embedBatch', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns [] without calling the API for an empty input', async () => {
    const vectors = await embedBatch([]);

    expect(vectors).toEqual([]);
    expect(mocked.embeddings.create).not.toHaveBeenCalled();
  });

  it('makes exactly one API call for multiple texts and returns vectors in order', async () => {
    mocked.embeddings.create.mockResolvedValue({
      data: [{ embedding: [1, 0] }, { embedding: [0, 1] }, { embedding: [1, 1] }],
    });

    const vectors = await embedBatch(['a', 'b', 'c']);

    expect(mocked.embeddings.create).toHaveBeenCalledTimes(1);
    expect(mocked.embeddings.create).toHaveBeenCalledWith(expect.objectContaining({ input: ['a', 'b', 'c'] }));
    expect(vectors).toEqual([[1, 0], [0, 1], [1, 1]]);
  });

  it('throws when the response vector count does not match the input count', async () => {
    mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [1, 0] }] });

    await expect(embedBatch(['a', 'b'])).rejects.toThrow('OpenRouter embedding response did not contain the expected vectors');
  });

  it('throws when the response has no data array', async () => {
    mocked.embeddings.create.mockResolvedValue({});

    await expect(embedBatch(['a'])).rejects.toThrow('OpenRouter embedding response did not contain the expected vectors');
  });

  it('truncates each oversized text before sending them to the API', async () => {
    mocked.embeddings.create.mockResolvedValue({ data: [{ embedding: [0.1] }, { embedding: [0.2] }] });

    await embedBatch(['short', 'y'.repeat(10_000)]);

    const sentInput = mocked.embeddings.create.mock.calls[0][0].input as string[];
    expect(sentInput[0]).toBe('short');
    expect(sentInput[1].length).toBe(6000);
  });
});
