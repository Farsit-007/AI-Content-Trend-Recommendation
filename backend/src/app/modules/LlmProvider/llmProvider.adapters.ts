import { LlmProviderType } from './llmProvider.interface';
import { anthropicAdapter } from './llmProvider.adapters.anthropic';
import { openaiAdapter } from './llmProvider.adapters.openai';
import { openrouterAdapter } from './llmProvider.adapters.openrouter';

export interface AdapterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /**
   * Marks this message as part of the prompt's stable prefix, eligible for provider-side prompt
   * caching. Only meaningful on a *leading contiguous run* of messages — see
   * `leadingCacheableCount`.
   *
   * A hint, not an instruction: Anthropic turns it into an explicit `cache_control` breakpoint,
   * while OpenAI and OpenRouter cache stable prefixes on their own and strip the field before it
   * reaches the wire. The caller's contract is that a marked message's content is genuinely
   * invariant across turns — marking volatile content does not fail loudly, it just quietly
   * stops the cache from ever hitting.
   */
  cacheable?: boolean;
}

/**
 * Token counts as reported by the provider for one call.
 *
 * Optional everywhere, and deliberately so: not every provider returns usage on every call path
 * (a streaming response only carries it when explicitly asked for, and some OpenRouter upstreams
 * omit it entirely). A missing `usage` must degrade to "we know a call happened but not how big it
 * was" — never to a thrown error or a fabricated zero, because a silently-invented 0 would make the
 * cost dashboard lie in the safe-looking direction.
 */
export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  /**
   * Portion of `prompt_tokens` served from the provider's own prompt cache, when reported. This is
   * the number Phase 2.2 is judged on — a cached prefix shows up here or the caching did not work.
   */
  cached_prompt_tokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: LlmUsage;
}

export interface EmbedResult {
  vector: number[];
  usage?: LlmUsage;
}

export interface EmbedBatchResult {
  vectors: number[][];
  usage?: LlmUsage;
}

/** Shared contract every provider implements — the "SDK kind of system" the registry is built around. */
export interface LlmProviderAdapter {
  chatCompletion: (
    model: string,
    messages: AdapterChatMessage[],
    temperature: number,
  ) => Promise<ChatCompletionResult>;
  /**
   * Same call, yielding text as it arrives. Optional on the interface so a future provider without
   * streaming stays implementable; callers fall back to the buffered `chatCompletion` when absent.
   *
   * Usage arrives via `onUsage` rather than the return value: an async generator's yields are the
   * text, and providers only report totals in a terminal frame after the last token. The callback
   * fires at most once, after the final chunk, and only if the provider reported anything.
   */
  streamChatCompletion?: (
    model: string,
    messages: AdapterChatMessage[],
    temperature: number,
    onUsage?: (usage: LlmUsage) => void,
  ) => AsyncIterable<string>;
  embed: (model: string, text: string) => Promise<EmbedResult>;
  embedBatch: (model: string, texts: string[]) => Promise<EmbedBatchResult>;
}

/** Resolves a concrete adapter for a provider_type, bound to one already-decrypted API key. */
export const getAdapter = (
  providerType: LlmProviderType,
  apiKey: string,
): LlmProviderAdapter => {
  switch (providerType) {
    case 'openrouter':
      return openrouterAdapter(apiKey);
    case 'anthropic':
      return anthropicAdapter(apiKey);
    case 'openai':
      return openaiAdapter(apiKey);
  }
};
