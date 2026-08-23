import Anthropic from '@anthropic-ai/sdk';
import {
  AdapterChatMessage,
  ChatCompletionResult,
  EmbedBatchResult,
  EmbedResult,
  LlmProviderAdapter,
  LlmUsage,
} from './llmProvider.adapters';
import { leadingCacheableCount } from './llmProvider.adapters.messages';
import { mapAnthropicUsage, mergeUsage } from './llmProvider.adapters.usage';

const MAX_TOKENS = 4096;

interface SystemTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string | SystemTextBlock[];
};

/**
 * Turns the conversation half of the prompt into Anthropic's `messages`, placing a second cache
 * breakpoint at the end of the leading cacheable run (the replayed history).
 *
 * Two breakpoints rather than one, because they cache different lifetimes. The system one covers a
 * prefix that never changes and so hits on every request from every conversation. This one covers
 * `persona + team + history`, which is longer — long enough to actually clear the 1024-token
 * minimum — and grows by one exchange per turn, so each turn extends the previous turn's entry
 * rather than starting over. Anthropic reads the longest cached prefix that matches, so having both
 * means a conversation whose history has just been trimmed still hits the short one instead of
 * falling all the way back to full price.
 *
 * A marked message's content becomes a single-element block array, since `cache_control` attaches
 * to a content block and not to a message.
 */
const toConversation = (
  messages: AdapterChatMessage[],
): ConversationMessage[] => {
  const breakpoint = leadingCacheableCount(messages) - 1;

  return messages.map((m, i) => {
    const role = m.role as 'user' | 'assistant';
    if (i !== breakpoint) return { role, content: m.content };
    return {
      role,
      content: [
        {
          type: 'text' as const,
          text: m.content,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
    };
  });
};

/**
 * Anthropic's API takes `system` as a top-level request param, not a message with role `system`
 * — the shared `AdapterChatMessage[]` contract still allows a system message anywhere in the
 * array (matching how every other adapter/call site already builds messages), so it must be
 * extracted here rather than passed through and rejected by the SDK.
 *
 * System messages are sent as an **array of text blocks** rather than one joined string, because a
 * `cache_control` breakpoint can only be attached to a block. Joining them (as this did before
 * prompt caching) collapses the caller's deliberate stable-prefix / volatile-suffix split into a
 * single opaque string, leaving nowhere to mark the boundary.
 *
 * At most two breakpoints are spent of Anthropic's four — one here at the end of the cacheable
 * system run, one in `toConversation` at the end of the replayed history.
 *
 * No minimum-length guard: Anthropic ignores `cache_control` on a prefix below the model's minimum
 * cacheable size (1024 tokens, 2048 on Haiku) and bills no cache write for it, so a guard here
 * could only ever be an approximation that is wrong for token-dense scripts — it would prevent no
 * cost while introducing a way to skip caching a prefix that would in fact have qualified.
 */
const splitSystemMessage = (
  messages: AdapterChatMessage[],
): { system?: SystemTextBlock[]; rest: ConversationMessage[] } => {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const rest = toConversation(messages.filter((m) => m.role !== 'system'));
  if (systemMessages.length === 0) return { system: undefined, rest };

  const breakpoint = leadingCacheableCount(systemMessages) - 1;

  return {
    system: systemMessages.map((m, i) => ({
      type: 'text',
      text: m.content,
      ...(i === breakpoint
        ? { cache_control: { type: 'ephemeral' as const } }
        : {}),
    })),
    rest,
  };
};

export const anthropicAdapter = (apiKey: string): LlmProviderAdapter => {
  // maxRetries 0: key-pool failover in lib/modelResolution.ts owns retry policy — an SDK retry
  // would re-send to the same rate-limited key.
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });

  return {
    chatCompletion: async (
      model: string,
      messages: AdapterChatMessage[],
      temperature: number,
    ): Promise<ChatCompletionResult> => {
      const { system, rest } = splitSystemMessage(messages);
      const completion = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        temperature,
        system,
        messages: rest,
      });

      const textBlock = completion.content.find(
        (block) => block.type === 'text',
      );
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Anthropic chat completion returned no text content');
      }
      return {
        content: textBlock.text,
        usage: mapAnthropicUsage(completion.usage),
      };
    },

    streamChatCompletion: async function* (
      model: string,
      messages: AdapterChatMessage[],
      temperature: number,
      onUsage?: (usage: LlmUsage) => void,
    ) {
      const { system, rest } = splitSystemMessage(messages);
      const stream = client.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        temperature,
        system,
        messages: rest,
      });

      // Anthropic splits usage across two frames: `message_start` carries the input side (including
      // any cache read), `message_delta` the output side. Neither is complete alone, so both are
      // collected and merged — taking only one would silently halve the recorded cost.
      let usage: LlmUsage | undefined;
      for await (const event of stream) {
        if (event.type === 'message_start') {
          usage = mergeUsage(usage, mapAnthropicUsage(event.message.usage));
        } else if (event.type === 'message_delta') {
          usage = mergeUsage(usage, mapAnthropicUsage(event.usage));
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
      if (usage) onUsage?.(usage);
    },

    // Anthropic has no embeddings endpoint — a real capability gap, not an oversight; see
    // design.md decision 3 of llm-provider-registry-foundation. LlmModel.capabilities is what
    // keeps Track A2's task resolver from ever routing an embedding task here.
    embed: async (): Promise<EmbedResult> => {
      throw new Error('anthropic does not support embeddings');
    },

    embedBatch: async (): Promise<EmbedBatchResult> => {
      throw new Error('anthropic does not support embeddings');
    },
  };
};
