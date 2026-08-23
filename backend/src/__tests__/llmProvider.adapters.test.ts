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
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'hello from openrouter' } }],
      });
      const adapter = getAdapter('openrouter', 'test-key');

      const result = await adapter.chatCompletion(
        'some/model',
        [{ role: 'user', content: 'hi' }],
        0.7,
      );

      expect(result.content).toBe('hello from openrouter');
    });

    it('throws when the chat completion response has no message content', async () => {
      mockOpenAIChatCreate.mockResolvedValue({ choices: [{ message: {} }] });
      const adapter = getAdapter('openrouter', 'test-key');

      await expect(
        adapter.chatCompletion(
          'some/model',
          [{ role: 'user', content: 'hi' }],
          0.7,
        ),
      ).rejects.toThrow(
        'OpenRouter chat completion returned no message content',
      );
    });

    it('returns an embedding vector', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });
      const adapter = getAdapter('openrouter', 'test-key');

      const result = await adapter.embed('embedding-model', 'some text');

      expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    });

    it('throws when the embedding response has no vector', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({ data: [] });
      const adapter = getAdapter('openrouter', 'test-key');

      await expect(
        adapter.embed('embedding-model', 'some text'),
      ).rejects.toThrow(
        'OpenRouter embedding response did not contain a vector',
      );
    });

    it('returns a batch of embedding vectors, one per input text', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
      });
      const adapter = getAdapter('openrouter', 'test-key');

      const result = await adapter.embedBatch('embedding-model', ['a', 'b']);

      expect(result.vectors).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    });

    it('embedBatch returns an empty array without calling the API for an empty input', async () => {
      const adapter = getAdapter('openrouter', 'test-key');
      const result = await adapter.embedBatch('embedding-model', []);
      expect(result.vectors).toEqual([]);
      expect(mockOpenAIEmbeddingsCreate).not.toHaveBeenCalled();
    });

    it('embedBatch throws when the response vector count does not match the input count', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2] }],
      });
      const adapter = getAdapter('openrouter', 'test-key');

      await expect(
        adapter.embedBatch('embedding-model', ['a', 'b']),
      ).rejects.toThrow(
        'OpenRouter embedding response did not contain the expected vectors',
      );
    });
  });

  describe('openai adapter', () => {
    it('returns chat completion text', async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'hello from openai' } }],
      });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.chatCompletion(
        'gpt-4o-mini',
        [{ role: 'user', content: 'hi' }],
        0.7,
      );

      expect(result.content).toBe('hello from openai');
    });

    it('returns an embedding vector', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.4, 0.5] }],
      });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.embed('text-embedding-3-small', 'some text');

      expect(result.vector).toEqual([0.4, 0.5]);
    });

    it('returns a batch of embedding vectors', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [1, 2] }, { embedding: [3, 4] }],
      });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.embedBatch('text-embedding-3-small', [
        'a',
        'b',
      ]);

      expect(result.vectors).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('anthropic adapter', () => {
    it('returns chat completion text, extracting the text content block', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'hello from claude' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      const result = await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [
          { role: 'system', content: 'you are helpful' },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      expect(result.content).toBe('hello from claude');
      // `system` is an array of text blocks rather than a joined string — that is what gives prompt
      // caching somewhere to attach a `cache_control` breakpoint.
      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [{ type: 'text', text: 'you are helpful' }],
          messages: [{ role: 'user', content: 'hi' }],
        }),
      );
    });

    it('omits system entirely when no system message is present', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [{ role: 'user', content: 'hi' }],
        0.7,
      );

      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ system: undefined }),
      );
    });

    it('throws when the response has no text content block', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'tool_use' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      await expect(
        adapter.chatCompletion('model', [{ role: 'user', content: 'hi' }], 0.7),
      ).rejects.toThrow('Anthropic chat completion returned no text content');
    });

    it('embed always throws, without making a network call', async () => {
      const adapter = getAdapter('anthropic', 'test-key');

      await expect(adapter.embed('any-model', 'some text')).rejects.toThrow(
        'anthropic does not support embeddings',
      );
      expect(mockAnthropicMessagesCreate).not.toHaveBeenCalled();
    });

    it('embedBatch always throws, without making a network call', async () => {
      const adapter = getAdapter('anthropic', 'test-key');

      await expect(adapter.embedBatch('any-model', ['a', 'b'])).rejects.toThrow(
        'anthropic does not support embeddings',
      );
      expect(mockAnthropicMessagesCreate).not.toHaveBeenCalled();
    });
  });

  /**
   * Prompt caching (Phase 2.2). The saving only materializes if the *same bytes* are sent in the
   * same order every turn, so these pin the two ways that silently breaks: a breakpoint landing in
   * the wrong place, and the hint leaking into a provider that does not understand it.
   */
  describe('prompt caching', () => {
    it('sends Anthropic system blocks as an array with one breakpoint at the end of the cacheable run', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [
          { role: 'system', content: 'persona', cacheable: true },
          { role: 'system', content: 'team', cacheable: true },
          { role: 'system', content: 'context' },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      // One breakpoint, on the last cacheable block — it caches everything up to and including
      // itself, so marking both would spend two of Anthropic's four for identical coverage.
      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [
            { type: 'text', text: 'persona' },
            {
              type: 'text',
              text: 'team',
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: 'context' },
          ],
        }),
      );
    });

    it('marks nothing when no system message is cacheable', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [
          { role: 'system', content: 'persona' },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [{ type: 'text', text: 'persona' }],
        }),
      );
    });

    it('stops the cached prefix at the first unmarked block, ignoring a later marked one', async () => {
      // The failure this prevents: a breakpoint placed after a volatile block would pull that block
      // into the cached prefix, so the cache would miss on every single turn while still paying to
      // write it. The prefix has to actually be a prefix.
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [
          { role: 'system', content: 'persona', cacheable: true },
          { role: 'system', content: 'volatile' },
          { role: 'system', content: 'marked-too-late', cacheable: true },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      const { system } = mockAnthropicMessagesCreate.mock.calls[0][0];
      expect(system[0]).toEqual({
        type: 'text',
        text: 'persona',
        cache_control: { type: 'ephemeral' },
      });
      expect(system[1]).toEqual({ type: 'text', text: 'volatile' });
      expect(system[2]).toEqual({ type: 'text', text: 'marked-too-late' });
    });

    it('puts the breakpoint on the final block when every system message is cacheable', async () => {
      // The arithmetic edge: breakpoint === length - 1, i.e. the last array index.
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [
          { role: 'system', content: 'a', cacheable: true },
          { role: 'system', content: 'b', cacheable: true },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [
            { type: 'text', text: 'a' },
            { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } },
          ],
        }),
      );
    });

    it('marks a lone cacheable system message', async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      });
      const adapter = getAdapter('anthropic', 'test-key');

      await adapter.chatCompletion(
        'claude-3-5-sonnet-20241022',
        [
          { role: 'system', content: 'only', cacheable: true },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [
            {
              type: 'text',
              text: 'only',
              cache_control: { type: 'ephemeral' },
            },
          ],
        }),
      );
    });

    it('strips the cacheable hint before it reaches an OpenAI-shaped provider', async () => {
      // `cacheable` is set on real runtime objects, and the casts between here and the SDK are
      // type-level only — an unrecognized property inside `messages[]` risks a 400.
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });
      const adapter = getAdapter('openai', 'test-key');

      await adapter.chatCompletion(
        'gpt-4o-mini',
        [
          { role: 'system', content: 'persona', cacheable: true },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      );

      expect(mockOpenAIChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'persona' },
            { role: 'user', content: 'hi' },
          ],
        }),
      );
    });

    it('strips the cacheable hint on the streaming path too', async () => {
      async function* fakeStream() {
        yield { choices: [{ delta: { content: 'a' } }] };
      }
      mockOpenAIChatCreate.mockResolvedValue(fakeStream());
      const adapter = getAdapter('openrouter', 'test-key');

      for await (const _ of adapter.streamChatCompletion!(
        'some/model',
        [
          { role: 'system', content: 'persona', cacheable: true },
          { role: 'user', content: 'hi' },
        ],
        0.7,
      )) {
        // drain
      }

      const sent = mockOpenAIChatCreate.mock.calls[0][0].messages;
      expect(
        sent.every((m: Record<string, unknown>) => !('cacheable' in m)),
      ).toBe(true);
    });
  });

  /**
   * Usage reporting is what makes every later token optimization measurable, so the contract worth
   * pinning is not just "tokens are read" but "a provider that reports nothing yields `undefined`,
   * never a zero". A fabricated 0 is indistinguishable from a free call on a spend dashboard.
   */
  describe('usage reporting', () => {
    it('reports token usage from an OpenAI-shaped completion, including the cached portion', async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'hi' } }],
        usage: {
          prompt_tokens: 1240,
          completion_tokens: 310,
          prompt_tokens_details: { cached_tokens: 1024 },
        },
      });
      const adapter = getAdapter('openrouter', 'test-key');

      const result = await adapter.chatCompletion(
        'some/model',
        [{ role: 'user', content: 'hi' }],
        0.7,
      );

      expect(result.usage).toEqual({
        prompt_tokens: 1240,
        completion_tokens: 310,
        cached_prompt_tokens: 1024,
      });
    });

    it('reports undefined usage — not zeros — when the provider omits it', async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: 'hi' } }],
      });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.chatCompletion(
        'gpt-4o-mini',
        [{ role: 'user', content: 'hi' }],
        0.7,
      );

      expect(result.usage).toBeUndefined();
    });

    it('reports embedding usage', async () => {
      mockOpenAIEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }],
        usage: { prompt_tokens: 42 },
      });
      const adapter = getAdapter('openai', 'test-key');

      const result = await adapter.embed('text-embedding-3-small', 'some text');

      expect(result.usage).toEqual({ prompt_tokens: 42, completion_tokens: 0 });
    });

    it("folds Anthropic's cache-read tokens into prompt_tokens and surfaces them separately", async () => {
      // Anthropic reports cache reads *alongside* input_tokens rather than inside them, so a naive
      // read of input_tokens alone would under-report a cached call by the size of the cache hit.
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        usage: {
          input_tokens: 200,
          output_tokens: 300,
          cache_read_input_tokens: 1000,
        },
      });
      const adapter = getAdapter('anthropic', 'test-key');

      const result = await adapter.chatCompletion(
        'model',
        [{ role: 'user', content: 'hi' }],
        0.7,
      );

      expect(result.usage).toEqual({
        prompt_tokens: 1200,
        completion_tokens: 300,
        cached_prompt_tokens: 1000,
      });
    });

    it('asks OpenAI-shaped providers to include usage in a stream', async () => {
      // Without stream_options a streamed response carries no usage at all, which would leave the
      // calls users make most (streamed chat and generation) invisible to metering.
      async function* fakeStream() {
        yield { choices: [{ delta: { content: 'a' } }] };
        yield {
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        };
      }
      mockOpenAIChatCreate.mockResolvedValue(fakeStream());
      const adapter = getAdapter('openrouter', 'test-key');

      const seen: string[] = [];
      let reported: unknown;
      for await (const chunk of adapter.streamChatCompletion!(
        'some/model',
        [{ role: 'user', content: 'hi' }],
        0.7,
        (usage) => {
          reported = usage;
        },
      )) {
        seen.push(chunk);
      }

      expect(seen).toEqual(['a']);
      expect(reported).toEqual({ prompt_tokens: 10, completion_tokens: 2 });
      expect(mockOpenAIChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          stream_options: { include_usage: true },
        }),
      );
    });
  });
});
