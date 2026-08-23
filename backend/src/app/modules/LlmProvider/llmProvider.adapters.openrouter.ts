import OpenAI from 'openai';
import config from '../../config';
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

/** Mirrors `lib/openrouterClient.ts`'s config exactly — same base URL, timeout, headers — bound to a caller-supplied key instead of the static `.env` one. */
export const openrouterAdapter = (apiKey: string): LlmProviderAdapter => {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    // 60s, not the SDK's 10-min default: still bounded, but roomy enough for large free-tier
    // reasoning models (e.g. nemotron-ultra) that regularly blow past 20s on long-form Bangla
    // posts — at 20s those requests died as timeouts and surfaced as "generation/refinement
    // failed" toasts even though the model would have answered.
    timeout: 60_000,
    // 0, not the SDK default: key-pool failover in lib/modelResolution.ts owns retry policy now.
    // An SDK-level retry would re-send to the *same* rate-limited key, doubling the latency and the
    // quota damage of every 429 before our own failover even gets a turn.
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': config.web_url as string,
      'X-Title': 'Growth Studio',
    },
  });

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
        throw new Error(
          'OpenRouter chat completion returned no message content',
        );
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
        // Without this a streamed response reports no usage at all, which would leave every
        // streamed chat and generation invisible to metering — i.e. exactly the calls users make
        // most. The terminal frame it adds carries `usage` and an empty `choices` array, which the
        // loop below already skips.
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
        throw new Error(
          'OpenRouter embedding response did not contain a vector',
        );
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
          'OpenRouter embedding response did not contain the expected vectors',
        );
      }
      return { vectors, usage: mapOpenAiUsage(response.usage) };
    },
  };
};
