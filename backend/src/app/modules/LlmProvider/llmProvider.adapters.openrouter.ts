import OpenAI from 'openai';
import config from '../../config';
import { AdapterChatMessage, LlmProviderAdapter } from './llmProvider.adapters';

const MAX_EMBED_INPUT_CHARS = 6000;

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
    maxRetries: 1,
    defaultHeaders: {
      'HTTP-Referer': config.web_url as string,
      'X-Title': 'Growth Studio',
    },
  });

  return {
    chatCompletion: async (model: string, messages: AdapterChatMessage[], temperature: number): Promise<string> => {
      const completion = await client.chat.completions.create({ model, messages, temperature });
      const content = completion.choices[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('OpenRouter chat completion returned no message content');
      }
      return content;
    },

    streamChatCompletion: async function* (model: string, messages: AdapterChatMessage[], temperature: number) {
      const stream = await client.chat.completions.create({ model, messages, temperature, stream: true });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },

    embed: async (model: string, text: string): Promise<number[]> => {
      const response = await client.embeddings.create({ model, input: text.slice(0, MAX_EMBED_INPUT_CHARS) });
      const vector = response.data?.[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new Error('OpenRouter embedding response did not contain a vector');
      }
      return vector;
    },

    embedBatch: async (model: string, texts: string[]): Promise<number[][]> => {
      if (texts.length === 0) return [];
      const response = await client.embeddings.create({
        model,
        input: texts.map((text) => text.slice(0, MAX_EMBED_INPUT_CHARS)),
      });
      const vectors = response.data?.map((entry) => entry.embedding);
      if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some((v) => !Array.isArray(v))) {
        throw new Error('OpenRouter embedding response did not contain the expected vectors');
      }
      return vectors;
    },
  };
};
