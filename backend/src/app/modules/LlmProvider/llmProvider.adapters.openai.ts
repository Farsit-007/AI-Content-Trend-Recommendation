import OpenAI from 'openai';
import {
  AdapterChatMessage,
  ChatCompletionResult,
  EmbedBatchResult,
  EmbedResult,
  LlmProviderAdapter,
  LlmUsage,
} from './llmProvider.adapters';
import { toPlainMessages } from './llmProvider.adapters.messages';
import { mapOpenAiUsage } from './llmProvider.adapters.usage';

const MAX_EMBED_INPUT_CHARS = 6000;

// Matches the Anthropic adapter, which has always bounded its output. Without a ceiling a model
// that fails to stop is billed all the way to the context limit, and the cost of one runaway
// completion dwarfs anything the rest of Phase 2 saves.
const MAX_TOKENS = 4096;

/** OpenAI's real API — no `baseURL` override, unlike the OpenRouter adapter. */
export const openaiAdapter = (apiKey: string): LlmProviderAdapter => {
  // maxRetries 0: key-pool failover in lib/modelResolution.ts owns retry policy — an SDK retry
  // would re-send to the same rate-limited key.
  const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 0 });

  return {
    chatCompletion: async (
      model: string,
      messages: AdapterChatMessage[],
      temperature: number,
    ): Promise<ChatCompletionResult> => {
      const completion = await client.chat.completions.create({
        model,
        messages: toPlainMessages(messages),
        temperature,
        max_tokens: MAX_TOKENS,
      });
      const content = completion.choices[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('OpenAI chat completion returned no message content');
      }
      return { content, usage: mapOpenAiUsage(completion.usage) };
    },

    streamChatCompletion: async function* (
      model: string,
      messages: AdapterChatMessage[],
      temperature: number,
      onUsage?: (usage: LlmUsage) => void,
    ) {
      const stream = await client.chat.completions.create({
        model,
        messages: toPlainMessages(messages),
        temperature,
        max_tokens: MAX_TOKENS,
        stream: true,
        // A streamed response reports no usage unless asked; without this every streamed call is
        // invisible to metering. The extra terminal frame carries `usage` with empty `choices`.
        stream_options: { include_usage: true },
      });
      let usage: LlmUsage | undefined;
      for await (const chunk of stream) {
        if (chunk.usage) usage = mapOpenAiUsage(chunk.usage);
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
      if (usage) onUsage?.(usage);
    },

    embed: async (model: string, text: string): Promise<EmbedResult> => {
      const response = await client.embeddings.create({
        model,
        input: text.slice(0, MAX_EMBED_INPUT_CHARS),
      });
      const vector = response.data?.[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new Error('OpenAI embedding response did not contain a vector');
      }
      return { vector, usage: mapOpenAiUsage(response.usage) };
    },

    embedBatch: async (
      model: string,
      texts: string[],
    ): Promise<EmbedBatchResult> => {
      if (texts.length === 0) return { vectors: [] };
      const response = await client.embeddings.create({
        model,
        input: texts.map((text) => text.slice(0, MAX_EMBED_INPUT_CHARS)),
      });
      const vectors = response.data?.map((entry) => entry.embedding);
      if (
        !Array.isArray(vectors) ||
        vectors.length !== texts.length ||
        vectors.some((v) => !Array.isArray(v))
      ) {
        throw new Error(
          'OpenAI embedding response did not contain the expected vectors',
        );
      }
      return { vectors, usage: mapOpenAiUsage(response.usage) };
    },
  };
};
