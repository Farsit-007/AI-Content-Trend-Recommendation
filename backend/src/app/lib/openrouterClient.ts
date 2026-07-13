import OpenAI from 'openai';
import config from '../config';

/**
 * OpenRouter is OpenAI-API-compatible, so the official `openai` SDK talks to
 * it directly via `baseURL` — this gives typed chat/embeddings calls, and
 * swapping models or adding new OpenRouter-backed features later is just a
 * model string change, not a new HTTP client.
 */
export const openrouter = new OpenAI({
  apiKey: config.openrouter_api_key,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': config.web_url as string,
    'X-Title': 'Growth Studio',
  },
});
