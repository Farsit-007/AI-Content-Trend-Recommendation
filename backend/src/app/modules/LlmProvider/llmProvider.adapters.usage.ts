import { LlmUsage } from './llmProvider.adapters';

/**
 * Provider usage payloads, normalized to one shape.
 *
 * Kept in its own module rather than in `llmProvider.adapters.ts` because that file imports the
 * three concrete adapters — a runtime helper living there would close a real require cycle. The
 * type import below is erased at compile time, so this direction is safe.
 *
 * Every mapper returns `undefined` rather than zeros when the provider reported nothing. That
 * distinction matters downstream: "0 tokens" and "we don't know" look identical on a cost chart,
 * and only one of them is true.
 */

/** OpenAI / OpenRouter — both speak the OpenAI completions schema. */
interface OpenAiShapedUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

export const mapOpenAiUsage = (
  usage: OpenAiShapedUsage | null | undefined,
): LlmUsage | undefined => {
  if (!usage) return undefined;
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  if (typeof prompt !== 'number' && typeof completion !== 'number')
    return undefined;

  const cached = usage.prompt_tokens_details?.cached_tokens;
  return {
    prompt_tokens: prompt ?? 0,
    completion_tokens: completion ?? 0,
    ...(typeof cached === 'number' ? { cached_prompt_tokens: cached } : {}),
  };
};

/**
 * Anthropic reports input and output separately, and splits cache reads out of the input count.
 *
 * `cache_read_input_tokens` is billed at a fraction of the normal input rate and is reported
 * *alongside* `input_tokens`, not inside it — so the two are summed here to keep `prompt_tokens`
 * meaning the same thing it does for the OpenAI-shaped providers: everything the model read.
 * `cache_creation_input_tokens` is the write side of the cache and is folded into the same total,
 * since it is input the model processed and was billed for.
 */
// `null` is admitted on every field, not just for tidiness: the SDK types `message_delta`'s usage
// as `MessageDeltaUsage`, where `input_tokens` is genuinely `number | null` (that frame reports
// only the output side). A `number | undefined` signature rejects it at compile time.
interface AnthropicShapedUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export const mapAnthropicUsage = (
  usage: AnthropicShapedUsage | null | undefined,
): LlmUsage | undefined => {
  if (!usage) return undefined;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  if (typeof input !== 'number' && typeof output !== 'number') return undefined;

  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return {
    prompt_tokens: (input ?? 0) + cacheRead + cacheWrite,
    completion_tokens: output ?? 0,
    ...(cacheRead > 0 ? { cached_prompt_tokens: cacheRead } : {}),
  };
};

/**
 * Merges the two halves of a streamed Anthropic response: `message_start` carries the input side,
 * `message_delta` the output side. Neither frame alone is a complete picture.
 */
export const mergeUsage = (
  a: LlmUsage | undefined,
  b: LlmUsage | undefined,
): LlmUsage | undefined => {
  if (!a) return b;
  if (!b) return a;
  const cached = (a.cached_prompt_tokens ?? 0) + (b.cached_prompt_tokens ?? 0);
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    ...(cached > 0 ? { cached_prompt_tokens: cached } : {}),
  };
};
