import config from '../config';
import { openrouter } from './openrouterClient';

export const LLM_MODELS = {
  /** Categorization, report generation, chat — fast, structured output */
  standard: config.llm_model_standard as string,
  /** Content generation (FB/LinkedIn/YouTube/captions) — stronger creative writing */
  content: config.llm_model_content as string,
  /** Always-available backup if the primary model is rate-limited or down */
  fallback: config.llm_model_fallback as string,
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

export const chatCompletion = async ({
  model,
  messages,
  temperature = 0.7,
}: ChatCompletionOptions): Promise<string> => {
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
