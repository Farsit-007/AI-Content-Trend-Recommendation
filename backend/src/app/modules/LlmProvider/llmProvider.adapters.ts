import { LlmProviderType } from './llmProvider.interface';
import { anthropicAdapter } from './llmProvider.adapters.anthropic';
import { openaiAdapter } from './llmProvider.adapters.openai';
import { openrouterAdapter } from './llmProvider.adapters.openrouter';

export interface AdapterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Shared contract every provider implements — the "SDK kind of system" the registry is built around. */
export interface LlmProviderAdapter {
  chatCompletion: (model: string, messages: AdapterChatMessage[], temperature: number) => Promise<string>;
  embed: (model: string, text: string) => Promise<number[]>;
  embedBatch: (model: string, texts: string[]) => Promise<number[][]>;
}

/** Resolves a concrete adapter for a provider_type, bound to one already-decrypted API key. */
export const getAdapter = (providerType: LlmProviderType, apiKey: string): LlmProviderAdapter => {
  switch (providerType) {
    case 'openrouter':
      return openrouterAdapter(apiKey);
    case 'anthropic':
      return anthropicAdapter(apiKey);
    case 'openai':
      return openaiAdapter(apiKey);
  }
};
