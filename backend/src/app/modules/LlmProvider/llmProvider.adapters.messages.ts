import { AdapterChatMessage } from './llmProvider.adapters';

/**
 * Message shaping shared by the adapters.
 *
 * Separate from `llmProvider.adapters.usage.ts` (which normalizes *responses*) and from
 * `llmProvider.adapters.ts` (which imports the concrete adapters, so a runtime helper there would
 * close a require cycle).
 */

export interface PlainChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Drops the `cacheable` hint before a message reaches an OpenAI-shaped SDK.
 *
 * This is not cosmetic. `cacheable` is set on real runtime objects in `chat.prompt.ts`; the casts
 * along the way are type-level only, so without this the field would be serialized into the
 * `messages[]` array of the actual HTTP request. OpenAI and OpenRouter have no such field, and an
 * unrecognized property inside a message object risks a strict-validation 400 — for a hint those
 * providers do not need anyway, since they cache stable prefixes automatically.
 */
export const toPlainMessages = (
  messages: AdapterChatMessage[],
): PlainChatMessage[] =>
  messages.map((m) => ({ role: m.role, content: m.content }));

/**
 * How many messages, counting from the front, form an unbroken run of `cacheable` ones.
 *
 * Deliberately the *leading contiguous* run rather than "the last message marked cacheable": a
 * cache breakpoint applies to everything before it, so marking a later block after an unmarked gap
 * would silently pull volatile content into the cached prefix and poison it on every turn. Stopping
 * at the first gap makes that structurally impossible instead of relying on call sites to order
 * their blocks correctly.
 *
 * **Precondition:** `messages` must already be filtered to the slice the breakpoint indexes into —
 * for Anthropic, the system messages alone. Passing a mixed-role array happens to give the same
 * answer today only because the cacheable blocks are the first elements either way; that is a
 * coincidence of one call site's ordering, not a property of this function.
 */
export const leadingCacheableCount = (
  messages: AdapterChatMessage[],
): number => {
  const firstGap = messages.findIndex((m) => !m.cacheable);
  return firstGap === -1 ? messages.length : firstGap;
};
