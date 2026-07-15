import config from '../config';
import { logger } from './logger';
import { openrouter } from './openrouterClient';

export const LLM_MODELS = {
  /** Categorization, report generation, chat — fast, structured output */
  standard: config.llm_model_standard,
  /** Content generation (FB/LinkedIn/YouTube/captions) — stronger creative writing */
  content: config.llm_model_content,
  /** Always-available backup if the primary model is rate-limited or down */
  fallback: config.llm_model_fallback,
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

const completeWith = async (model: string, messages: ChatMessage[], temperature: number): Promise<string> => {
  const completion = await openrouter.chat.completions.create({
    model,
    messages,
    temperature,
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter chat completion returned no message content');
  }
  return content;
};

/**
 * Chat completion with automatic failover: if the requested model errors (rate limit,
 * outage, empty response), the call is retried once on `LLM_MODELS.fallback` so a single
 * 429 on the free tier doesn't hard-fail generate/chat/report requests.
 */
export const chatCompletion = async ({
  model,
  messages,
  temperature = 0.7,
}: ChatCompletionOptions): Promise<string> => {
  try {
    return await completeWith(model, messages, temperature);
  } catch (primaryError) {
    const fallbackModel = LLM_MODELS.fallback;
    if (!fallbackModel || fallbackModel === model) {
      throw primaryError;
    }
    logger.warn(
      { model, fallbackModel, err: primaryError instanceof Error ? primaryError.message : primaryError },
      'Primary LLM model failed, retrying on fallback model',
    );
    return completeWith(fallbackModel, messages, temperature);
  }
};
