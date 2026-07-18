import OpenAI from 'openai';
import { AdapterChatMessage, LlmProviderAdapter } from './llmProvider.adapters';

const MAX_EMBED_INPUT_CHARS = 6000;

/** OpenAI's real API — no `baseURL` override, unlike the OpenRouter adapter. */
export const openaiAdapter = (apiKey: string): LlmProviderAdapter => {
  const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });

  return {
    chatCompletion: async (model: string, messages: AdapterChatMessage[], temperature: number): Promise<string> => {
      const completion = await client.chat.completions.create({ model, messages, temperature });
      const content = completion.choices[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('OpenAI chat completion returned no message content');
      }
      return content;
    },

    embed: async (model: string, text: string): Promise<number[]> => {
      const response = await client.embeddings.create({ model, input: text.slice(0, MAX_EMBED_INPUT_CHARS) });
      const vector = response.data?.[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new Error('OpenAI embedding response did not contain a vector');
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
        throw new Error('OpenAI embedding response did not contain the expected vectors');
      }
      return vectors;
    },
  };
};
