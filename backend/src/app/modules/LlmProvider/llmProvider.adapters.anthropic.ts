import Anthropic from '@anthropic-ai/sdk';
import { AdapterChatMessage, LlmProviderAdapter } from './llmProvider.adapters';

const MAX_TOKENS = 4096;

/**
 * Anthropic's API takes `system` as a top-level request param, not a message with role `system`
 * — the shared `AdapterChatMessage[]` contract still allows a system message anywhere in the
 * array (matching how every other adapter/call site already builds messages), so it must be
 * extracted here rather than passed through and rejected by the SDK.
 */
const splitSystemMessage = (messages: AdapterChatMessage[]): { system?: string; rest: AdapterChatMessage[] } => {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  return { system: systemMessages.length > 0 ? systemMessages.map((m) => m.content).join('\n\n') : undefined, rest };
};

export const anthropicAdapter = (apiKey: string): LlmProviderAdapter => {
  // maxRetries 0: key-pool failover in lib/modelResolution.ts owns retry policy — an SDK retry
  // would re-send to the same rate-limited key.
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });

  return {
    chatCompletion: async (model: string, messages: AdapterChatMessage[], temperature: number): Promise<string> => {
      const { system, rest } = splitSystemMessage(messages);
      const completion = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        temperature,
        system,
        messages: rest.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      });

      const textBlock = completion.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Anthropic chat completion returned no text content');
      }
      return textBlock.text;
    },

    streamChatCompletion: async function* (model: string, messages: AdapterChatMessage[], temperature: number) {
      const { system, rest } = splitSystemMessage(messages);
      const stream = client.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        temperature,
        system,
        messages: rest.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    },

    // Anthropic has no embeddings endpoint — a real capability gap, not an oversight; see
    // design.md decision 3 of llm-provider-registry-foundation. LlmModel.capabilities is what
    // keeps Track A2's task resolver from ever routing an embedding task here.
    embed: async (): Promise<number[]> => {
      throw new Error('anthropic does not support embeddings');
    },

    embedBatch: async (): Promise<number[][]> => {
      throw new Error('anthropic does not support embeddings');
    },
  };
};
