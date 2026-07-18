const mockOpenAIChatCreate = jest.fn();
const mockOpenAIEmbeddingsCreate = jest.fn();
const mockAnthropicMessagesCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAIChatCreate } },
    embeddings: { create: mockOpenAIEmbeddingsCreate },
  }));
});

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicMessagesCreate },
  }));
});

import { getAdapter } from '../app/modules/LlmProvider/llmProvider.adapters';

describe('LLM provider adapters', () => {
  afterEach(() => {
    mockOpenAIChatCreate.mockReset();
    mockOpenAIEmbeddingsCreate.mockReset();
    mockAnthropicMessagesCreate.mockReset();
  });

  describe('openrouter adapter', () => {
    it('returns chat completion text', async () => {
      mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: { content: 'hello from openrouter' } }] });
      const adapter = getAdapter('openrouter', 'test-key');

      const result = await adapter.chatCompletion('some/model', [{ role: 'user', content: 'hi' }], 0.7);

      expect(result).toBe('hello from openrouter');
    });

    it('throws when the chat completion response has no message content', async () => {
      mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: {} }] });
      const adapter = getAdapter('openrouter', 'test-key');

      await expect(adapter.chatCompletion('some/model', [{ role: 'user', content: 'hi' }], 0.7)).rejects.toThrow(
        'OpenRouter chat completion returned no message content',
      );
    });

    it('returns an embedding vector', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
      const adapter = getAdapter('openrouter', 'test-key');

      const result = await adapter.embed('embedding-model', 'some text');

      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('throws when the embedding response has no vector', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({ data: [] });
      const adapter = getAdapter('openrouter', 'test-key');

      await expect(adapter.embed('embedding-model', 'some text')).rejects.toThrow(
        'OpenRouter embedding response did not contain a vector',
      );
    });

    it('returns a batch of embedding vectors, one per input text', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
      });
      const adapter = getAdapter('openrouter', 'test-key');

      const result = await adapter.embedBatch('embedding-model', ['a', 'b']);

      expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    });

    it('embedBatch returns an empty array without calling the API for an empty input', async () => {
      const adapter = getAdapter('openrouter', 'test-key');
      const result = await adapter.embedBatch('embedding-model', []);
      expect(result).toEqual([]);
      expect(mockOpenAIEmbeddingsCreate).not.toHaveBeenCalled();
    });

    it('embedBatch throws when the response vector count does not match the input count', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
      const adapter = getAdapter('openrouter', 'test-key');

      await expect(adapter.embedBatch('embedding-model', ['a', 'b'])).rejects.toThrow(
        'OpenRouter embedding response did not contain the expected vectors',
      );
    });
  });

  describe('openai adapter', () => {
    it('returns chat completion text', async () => {
      mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: { content: 'hello from openai' } }] });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.chatCompletion('gpt-4o-mini', [{ role: 'user', content: 'hi' }], 0.7);

      expect(result).toBe('hello from openai');
    });

    it('returns an embedding vector', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [0.4, 0.5] }] });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.embed('text-embedding-3-small', 'some text');

      expect(result).toEqual([0.4, 0.5]);
    });

    it('returns a batch of embedding vectors', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: [1, 2] }, { embedding: [3, 4] }] });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.embedBatch('text-embedding-3-small', ['a', 'b']);

      expect(result).toEqual([[1, 2], [3, 4]]);
    });
  });

  describe('anthropic adapter', () => {
    it('returns chat completion text, extracting the text content block', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hello from claude' }] });
      const adapter = getAdapter('anthropic', 'test-key');

      const result = await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [
          { role: 'system', content: 'you are helpful' },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      expect(result).toBe('hello from claude');
      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'you are helpful',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      );
    });

    it('joins multiple system messages and omits system entirely when none are present', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const adapter = getAdapter('anthropic', 'test-key');

      await adapter.chatCompletion('claude-3-5-sonnet-20241022', [{ role: 'user', content: 'hi' }], 0.7);

      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({ system: undefined }));
    });

    it('throws when the response has no text content block', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({ content: [{ type: 'tool_use' }] });
      const adapter = getAdapter('anthropic', 'test-key');

      await expect(adapter.chatCompletion('model', [{ role: 'user', content: 'hi' }], 0.7)).rejects.toThrow(
        'Anthropic chat completion returned no text content',
      );
    });

    it('embed always throws, without making a network call', async () => {
      const adapter = getAdapter('anthropic', 'test-key');

      await expect(adapter.embed('any-model', 'some text')).rejects.toThrow('anthropic does not support embeddings');
      expect(mockAnthropicMessagesCreate).not.toHaveBeenCalled();
    });

    it('embedBatch always throws, without making a network call', async () => {
      const adapter = getAdapter('anthropic', 'test-key');

      await expect(adapter.embedBatch('any-model', ['a', 'b'])).rejects.toThrow('anthropic does not support embeddings');
      expect(mockAnthropicMessagesCreate).not.toHaveBeenCalled();
    });
  });
});
