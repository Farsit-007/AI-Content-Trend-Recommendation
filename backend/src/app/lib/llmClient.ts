import config from '../config';
import { logger } from './logger';
import { openrouter } from './openrouterClient';
import { ChatCompletionResult } from '../modules/LlmProvider/llmProvider.adapters';
import { toPlainMessages } from '../modules/LlmProvider/llmProvider.adapters.messages';
import { mapOpenAiUsage } from '../modules/LlmProvider/llmProvider.adapters.usage';

export const LLM_MODELS = {
  /** Categorization, report generation, chat — fast, structured output */
  standard: config.llm_model_standard,
  /** Content generation (FB/LinkedIn/YouTube/captions) — stronger creative writing */
  content: config.llm_model_content,
  /** Always-available backup if the primary model is rate-limited or down */
  fallback: config.llm_model_fallback,
};

if (LLM_MODELS.fallback === LLM_MODELS.content) {
  logger.warn(
    { model: LLM_MODELS.content },
    'LLM_MODEL_FALLBACK is identical to LLM_MODEL_CONTENT — failover is effectively disabled for content ' +
      'generation (a primary-model failure will not retry on a different model). Set LLM_MODEL_FALLBACK to a distinct model.',
  );
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

const completeWith = async (
  model: string,
  messages: ChatMessage[],
  temperature: number,
): Promise<ChatCompletionResult> => {
  const completion = await openrouter.chat.completions.create({
    model,
    // Stripped, not forwarded: the bootstrap tier receives the same message objects `chat.prompt.ts`
    // builds, and a `cacheable` hint survives the `as ChatMessage[]` cast in `modelResolution.ts`
    // (a cast changes the type, not the runtime object). OpenRouter has no such field.
    messages: toPlainMessages(messages),
    temperature,
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter chat completion returned no message content');
  }
  return { content, usage: mapOpenAiUsage(completion.usage) };
};

/**
 * Chat completion with automatic failover: if the requested model errors (rate limit,
 * outage, empty response), the call is retried once on `LLM_MODELS.fallback` so a single
 * 429 on the free tier doesn't hard-fail generate/chat/report requests.
 */
export const chatCompletionWithUsage = async ({
  model,
  messages,
  temperature = 0.7,
}: ChatCompletionOptions): Promise<ChatCompletionResult> => {
  try {
    return await completeWith(model, messages, temperature);
  } catch (primaryError) {
    const fallbackModel = LLM_MODELS.fallback;
    if (!fallbackModel || fallbackModel === model) {
      throw primaryError;
    }
    logger.warn(
      {
        model,
        fallbackModel,
        err:
          primaryError instanceof Error ? primaryError.message : primaryError,
      },
      'Primary LLM model failed, retrying on fallback model',
    );
    return completeWith(fallbackModel, messages, temperature);
  }
};

/**
 * Text-only wrapper, kept so the bake-off harness and the dedup verification script are untouched
 * by usage metering. `modelResolution.ts` uses `chatCompletionWithUsage` instead, because the
 * bootstrap tier is still a real (if legacy) way to spend money and should not be a blind spot.
 */
export const chatCompletion = async (
  options: ChatCompletionOptions,
): Promise<string> => (await chatCompletionWithUsage(options)).content;
